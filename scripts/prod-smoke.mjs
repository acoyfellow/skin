#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE ?? "https://skin.coey.dev";

const SESSION = (process.env.SMOKE_SESSION ?? (existsSync(".debug/session.txt") ? readFileSync(".debug/session.txt", "utf8") : "")).trim();

if (SESSION === "") {
	console.log("FAIL  no session: set SMOKE_SESSION or save a signed-in skin_session cookie to .debug/session.txt");
	process.exit(1);
}

const browserApp = await chromium.launch();

const context = await browserApp.newContext();

await context.addCookies([{ name: "__Host-skin_session", value: SESSION, url: BASE, secure: true, httpOnly: true, sameSite: "Lax" }]);

const page = await context.newPage();

await page.goto(`${BASE}/settings`);

const MODELS = (process.env.SMOKE_MODELS ?? "claude-opus-5-5,@cf/zai-org/glm-5.3-flash").split(",").filter((model) => model !== "");

const FRESH_BUILD_FLOOR_MS = 2000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const evaluate = (expression) => page.evaluate(`(async()=>{${expression}})()`);

const results = [];

const step = async (name, run) => {
	const started = Date.now();

	try {
		const detail = await run();

		results.push({ name, ok: true, detail, ms: Date.now() - started });
		console.log(`pass  ${name}: ${detail}`);
	} catch (cause) {
		results.push({ name, ok: false, detail: String(cause), ms: Date.now() - started });
		console.log(`FAIL  ${name}: ${String(cause)}`);
	}
};

const saveModel = (model) =>
	evaluate(
		[
			"const f=new FormData();",
			`f.set('model',${JSON.stringify(model)});`,
			"const t=await (await fetch('/settings',{method:'POST',body:f})).text();",
			"if(!t.includes('notice saved'))throw new Error('this deploy does not offer that model');",
			"return 'saved';",
		].join(""),
	);

const inferenceCheck = () => evaluate("return await (await fetch('/_kernel/api/inference-check',{method:'POST'})).json()");

const chat = async (text) => {
	await page.goto(`${BASE}/`);
	await page.locator("#task").waitFor({ timeout: 60_000 });
	await page.getByRole("button", { name: "New chat" }).click().catch(() => undefined);
	await page.locator("#task").fill(text);
	await page.locator("#task").press("Enter");

	for (let tries = 0; tries < 60; tries++) {
		await sleep(3000);
		const tail = await page.evaluate(() => (document.querySelector("[role=log]") ?? document.body).innerText.slice(-500));

		if (/Run ended|Failed/.test(tail)) throw new Error(tail.split("\n").filter(Boolean).slice(-2).join(" / "));

		if (tries > 1 && /pong/i.test(tail.split(text).pop() ?? "")) return "replied pong";
	}

	throw new Error("no reply within 3 minutes");
};

const EXPECTED_VERSION = process.env.SMOKE_EXPECT_VERSION ?? "";

await step("signed in, on the version under test", async () => {
	for (let tries = 0; tries < 30; tries++) {
		const version = await evaluate("const r=await fetch('/_kernel/api/me',{cache:'no-store'});if(r.status!==200)throw new Error('not signed in: '+r.status+'. Sign in at /oauth/login in '+location.host);return (await r.json()).version");

		if (EXPECTED_VERSION === "" || version === EXPECTED_VERSION) return `version ${version}`;

		await sleep(4000);
	}

	throw new Error(`production never switched to ${EXPECTED_VERSION}`);
});

await step("a fresh build goes live", async () => {
	const marker = `smoke ${new Date().toISOString()} ${Math.random().toString(36).slice(2)}`;

	const report = await evaluate(
		`const put=await fetch('/_kernel/api/files/'+encodeURIComponent('public/smoke.txt'),{method:'PUT',body:${JSON.stringify(marker)}});if(!put.ok)throw new Error('write failed '+put.status);const r=await fetch('/_kernel/api/ship',{method:'POST',body:'smoke: fresh build'});return await r.json()`,
		240_000,
	);

	if (report.status !== "live") throw new Error(`generation ${report.generation} ${report.status}: ${report.reason}`);

	const bundle = report.checks.find((check) => check.name === "bundle");

	if (bundle === undefined || bundle.ms < FRESH_BUILD_FLOOR_MS) throw new Error(`bundle took ${bundle?.ms} ms, which is too fast to be a fresh build`);

	const served = await evaluate("return await (await fetch('/smoke.txt',{cache:'no-store'})).text()");

	if (served.trim() !== marker) throw new Error(`live app serves "${served.slice(0, 60)}", not the new marker`);

	return `generation ${report.generation} live, bundled in ${bundle.ms} ms, marker served`;
});

for (const model of MODELS) {
	await step(`chat replies with ${model}`, async () => {
		await saveModel(model);
		const check = await inferenceCheck();

		if (!check.ok) throw new Error(`${check.route}: ${check.problem ?? check.status}`);

		return `${check.route}; ${await chat("Reply with exactly the word: pong")}`;
	});
}

const failed = results.filter((result) => !result.ok);

console.log(failed.length === 0 ? `\nsmoke passed: ${results.length} steps` : `\nsmoke FAILED: ${failed.length} of ${results.length} steps`);

await browserApp.close();

process.exit(failed.length === 0 ? 0 : 1);

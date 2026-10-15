#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const BASE = process.env.SMOKE_BASE ?? "https://skin.coey.dev";

const SURFACE = process.env.SMOKE_SURFACE ?? "surface:263";

const GATEWAY_MODEL = process.env.SMOKE_GATEWAY_MODEL ?? "claude-opus-5-5";

const GATEWAY = process.env.SMOKE_GATEWAY ?? "gateway:jordan";

const DIRECT_MODEL = process.env.SMOKE_DIRECT_MODEL ?? "@cf/zai-org/glm-5.3-flash";

const FRESH_BUILD_FLOOR_MS = 2000;

const browser = (...args) => execFileSync("cmux", ["browser", SURFACE, ...args], { encoding: "utf8", timeout: 120_000 }).trim();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const evaluate = async (expression, timeoutMs = 180_000) => {
	const slot = `__smoke_${Date.now()}_${Math.random().toString(36).slice(2)}`;

	browser("eval", `window.${slot}=undefined;Promise.resolve().then(async()=>{${expression}}).then(v=>window.${slot}=JSON.stringify({ok:true,v}),e=>window.${slot}=JSON.stringify({ok:false,e:String(e)}));'started'`);

	for (const deadline = Date.now() + timeoutMs; Date.now() < deadline; await sleep(2000)) {
		const raw = browser("eval", `String(window.${slot})`);

		if (raw !== "undefined") {
			const result = JSON.parse(raw);

			if (!result.ok) throw new Error(result.e);

			return result.v;
		}
	}

	throw new Error(`timed out after ${timeoutMs} ms`);
};

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

const saveRoute = (route, model) =>
	evaluate(
		[
			"const page=await (await fetch('/settings')).text();",
			"const picked=[...new DOMParser().parseFromString(page,'text/html').querySelectorAll('select[name=account] option')];",
			"const account=(picked.find(o=>o.selected)||picked[0]).value;",
			"const f=new FormData();f.set('account',account);",
			`f.set('route',${JSON.stringify(route)});f.set('model',${JSON.stringify(model)});f.set('intent','save');`,
			"const t=await (await fetch('/settings',{method:'POST',body:f})).text();",
			"if(!t.includes('notice saved'))throw new Error('settings did not save');",
			"return 'saved';",
		].join(""),
	);

const routeCheck = () => evaluate("return await (await fetch('/_kernel/api/route-check',{method:'POST'})).json()", 60_000);

const chat = async (text) => {
	browser("goto", `${BASE}/`);
	await sleep(6000);
	browser("eval", "[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='New chat')?.click();'n'");
	await sleep(1500);
	browser("click", "#task");
	browser("type", "#task", text);
	await sleep(500);
	browser("press", "Enter");

	for (let tries = 0; tries < 60; tries++) {
		await sleep(3000);
		const tail = browser("eval", "(document.querySelector('[role=log]')||document.body).innerText.slice(-500)");

		if (/Run ended|Failed/.test(tail)) throw new Error(tail.split("\n").filter(Boolean).slice(-2).join(" / "));

		const idle = browser("eval", "!!document.querySelector('#send') && !/Stop/.test(document.querySelector('#send').textContent)");

		if (tries > 2 && idle === "true" && /pong/i.test(tail.split(text).pop() ?? "")) return "replied pong";
	}

	throw new Error("no reply within 3 minutes");
};

const EXPECTED_VERSION = process.env.SMOKE_EXPECT_VERSION ?? "";

await step("signed in, on the version under test", async () => {
	browser("goto", `${BASE}/settings`);
	await sleep(4000);

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

await step(`chat replies on Workers AI direct (${DIRECT_MODEL})`, async () => {
	await saveRoute("workers-ai", DIRECT_MODEL);
	const check = await routeCheck();

	if (!check.ok) throw new Error(check.problem ?? `route check ${check.status}`);

	return chat("Reply with exactly the word: pong");
});

await step(`chat replies through ${GATEWAY} (${GATEWAY_MODEL})`, async () => {
	await saveRoute(GATEWAY, GATEWAY_MODEL);
	const check = await routeCheck();

	if (!check.ok) throw new Error(check.problem ?? `route check ${check.status}`);

	return chat("Reply with exactly the word: pong");
});

const failed = results.filter((result) => !result.ok);

console.log(failed.length === 0 ? `\nsmoke passed: ${results.length} steps` : `\nsmoke FAILED: ${failed.length} of ${results.length} steps`);

process.exit(failed.length === 0 ? 0 : 1);

import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = (process.env.BASE ?? "http://localhost:8790").replace(/\/$/, "");

const TARGET = process.env.TARGET ?? (BASE.includes("localhost") ? "local" : "deployed");

const ACCESS = process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET ? { "CF-Access-Client-Id": process.env.CF_ACCESS_CLIENT_ID, "CF-Access-Client-Secret": process.env.CF_ACCESS_CLIENT_SECRET } : {};

const ORIGIN = new URL(BASE).origin;

const NONCE = Math.random().toString(36).slice(2, 8);

const results = [];

const started = Date.now();

const http = async (method, path, body) => {
	const init = { method, headers: { ...ACCESS, Origin: ORIGIN, Accept: "text/html,application/json" }, redirect: "manual" };
	const response = await fetch(BASE + path, body === undefined ? init : { ...init, body });
	const text = await response.text();

	return { status: response.status, text, generation: Number(response.headers.get("x-generation") ?? NaN) };
};

const state = async () => JSON.parse((await http("GET", "/_kernel/api/body")).text);

const read = async (path) => {
	const response = await http("GET", `/_kernel/api/files/${encodeURIComponent(path)}`);

	if (response.status !== 200) throw new Error(`could not read ${path}: ${response.status}`);

	return response.text;
};

const write = async (path, content) => {
	const response = await http("PUT", `/_kernel/api/files/${encodeURIComponent(path)}`, content);

	if (response.status !== 200) throw new Error(`could not write ${path}: ${response.status} ${response.text}`);
};

const ship = async (message) => JSON.parse((await http("POST", "/_kernel/api/ship", message)).text);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const until = async (what, probe, timeoutMs) => {
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		const value = await probe();

		if (value) return value;

		await sleep(1500);
	}

	throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}`);
};

const scenario = async (name, expected, run) => {
	const at = Date.now();

	try {
		const observed = await run();

		results.push({ name, expected, observed, pass: true, ms: Date.now() - at });
		console.log(`pass  ${name} (${Date.now() - at} ms)`);
	} catch (error) {
		results.push({ name, expected, observed: String(error?.message ?? error).slice(0, 400), pass: false, ms: Date.now() - at });
		console.log(`FAIL  ${name}: ${String(error?.message ?? error).slice(0, 400)}`);
	}
};

const browser = await chromium.launch();

const visit = async () => {
	const context = await browser.newContext({ extraHTTPHeaders: ACCESS });
	const page = await context.newPage();
	const reports = [];
	const errors = [];

	page.on("request", (request) => {
		if (request.url().endsWith("/_kernel/api/report")) reports.push(JSON.parse(request.postData() ?? "{}"));
	});
	page.on("pageerror", (error) => errors.push(String(error)));
	await page.goto(`${BASE}/`, { waitUntil: "load" });
	await until("the crash guard to report", async () => reports.length > 0, 15_000);

	const text = (await page.innerText("body")).replace(/\s+/g, " ");
	const generation = await page.evaluate(() => globalThis.__GENERATION__);

	await context.close();

	return { report: reports[0], text, generation, errors };
};

const live = async () => (await state()).live;

const expectRejected = (report, stage) => {
	if (report.status !== "rejected") throw new Error(`expected rejected, got ${report.status}: ${report.reason}`);

	const failed = report.checks.find((check) => !check.ok);

	if (failed?.name !== stage) throw new Error(`expected the ${stage} check to fail, but ${failed?.name ?? "nothing"} failed`);

	return failed;
};

const servedGeneration = async () => (await http("GET", "/")).generation;

let seed;

let original = {};

let good;

await scenario("the seed grows into a live generation that starts in a real browser", "a live generation; the guard reports ok", async () => {
	await http("GET", "/");
	seed = await until("a live generation", live, 240_000);

	for (const path of ["src/entry.ts", "src/server.ts", "src/update.ts", "src/view/index.ts"]) original[path] = await read(path);

	const visit1 = await visit();

	if (!visit1.report.ok) throw new Error(`the guard reported a crash: ${visit1.report.detail}`);

	return { live: seed, generation: visit1.generation, report: visit1.report, errors: visit1.errors };
});

await scenario("a change that does not bundle is rejected and the live app is untouched", "ship rejected at bundle; / still serves the same generation", async () => {
	await write("src/entry.ts", `${original["src/entry.ts"]}\nexport const = ;\n`);

	const report = await ship(`e2e ${NONCE}: syntax error`);
	const failed = expectRejected(report, "bundle");
	const served = await servedGeneration();

	await write("src/entry.ts", original["src/entry.ts"]);

	if (served !== seed) throw new Error(`/ served generation ${served}, expected ${seed}`);

	return { generation: report.generation, failedCheck: failed.name, detail: failed.detail.split("\n")[0], served };
});

await scenario("a server that throws when it starts is rejected", "ship rejected at boot", async () => {
	await write("src/server.ts", `throw new Error("e2e ${NONCE}: the server refuses to start");\n${original["src/server.ts"]}`);

	const report = await ship(`e2e ${NONCE}: server throws on start`);
	const failed = expectRejected(report, "boot");

	await write("src/server.ts", original["src/server.ts"]);

	return { generation: report.generation, failedCheck: failed.name, detail: failed.detail.split("\n")[0], live: await live() };
});

await scenario("a change that breaks a behavior the checks cover is rejected", "ship rejected at checks, naming the failing story", async () => {
	const broken = original["src/update.ts"].replace("const trimmed = text.trim();", "const trimmed = text;");

	if (broken === original["src/update.ts"]) throw new Error("could not find the line to break in src/update.ts");

	await write("src/update.ts", broken);

	const report = await ship(`e2e ${NONCE}: stop trimming the draft`);
	const failed = expectRejected(report, "checks");

	await write("src/update.ts", original["src/update.ts"]);

	return { generation: report.generation, failedCheck: failed.name, failing: failed.detail.split("\n").filter((line) => line.startsWith("FAIL")).slice(0, 3), live: await live() };
});

await scenario("data the server stores survives a new generation and a rollback", "a note written now is still there at the end", async () => {
	const note = await http("POST", "/api/notes", JSON.stringify({ text: `e2e note ${NONCE}` }));

	if (note.status !== 201) throw new Error(`POST /api/notes returned ${note.status}: ${note.text}`);

	return { status: note.status };
});

await scenario("a good change goes live and renders in the browser", "ship live; / serves the new generation; the page shows the change", async () => {
	const marker = `planarian ${NONCE}`;
	const changed = original["src/view/index.ts"].replace('["planarian"]', JSON.stringify([marker]));

	if (changed === original["src/view/index.ts"]) throw new Error("could not find the title in src/view/index.ts");

	await write("src/view/index.ts", changed);

	const report = await ship(`e2e ${NONCE}: new title`);

	if (report.status !== "live") throw new Error(`expected live, got ${report.status}: ${report.reason}`);

	good = report.generation;

	const served = await servedGeneration();
	const seen = await visit();

	if (served !== good) throw new Error(`/ served ${served}, expected ${good}`);

	if (!seen.text.includes(marker)) throw new Error("the page does not show the new title");

	if (!seen.report.ok) throw new Error(`the guard reported a crash: ${seen.report.detail}`);

	return { generation: good, served, checks: report.checks.map((check) => `${check.name}:${check.ok}:${check.ms}ms`), report: seen.report };
});

await scenario("a page that crashes in the browser is rolled back by the kernel on its own", "ship live (the server gate cannot see it); the first browser load reports a crash; live returns to the last good generation", async () => {
	await write("src/entry.ts", `throw new Error("e2e ${NONCE}: the page crashes on start");\n${original["src/entry.ts"]}`);

	const report = await ship(`e2e ${NONCE}: page crashes on start`);

	if (report.status !== "live") throw new Error(`expected the gate to pass it (it only crashes in a browser), got ${report.status}: ${report.reason}`);

	const crashed = report.generation;
	const seen = await visit();

	if (seen.report.ok) throw new Error("the guard reported ok for a page that throws on start");

	const after = await until("the kernel to roll back", async () => {
		const current = await state();

		return current.live !== crashed ? current : undefined;
	}, 20_000);

	const row = after.generations.find((generation) => generation.id === crashed);

	await write("src/entry.ts", original["src/entry.ts"]);

	if (after.live !== good) throw new Error(`live is ${after.live}, expected the last good generation ${good}`);

	return { crashed, report: seen.report, liveAfter: after.live, status: row?.status, note: row?.note };
});

await scenario("rolling back makes the seed live again and resets the draft to match", "live is the seed; / serves it; the draft has the original title; the note is still there", async () => {
	const response = await http("POST", `/_kernel/api/rollback/${seed}`);
	const outcome = JSON.parse(response.text);

	if (outcome._tag !== "Success") throw new Error(`rollback failed: ${response.text}`);

	const served = await servedGeneration();
	const title = await read("src/view/index.ts");
	const notes = JSON.parse((await http("GET", "/api/notes")).text).notes;

	if (served !== seed) throw new Error(`/ served ${served}, expected ${seed}`);

	if (title !== original["src/view/index.ts"]) throw new Error("the draft does not match the seed");

	if (!notes.includes(`e2e note ${NONCE}`)) throw new Error(`the note is gone: ${JSON.stringify(notes)}`);

	return { live: (await state()).live, served, notes: notes.length };
});

await browser.close();

const passed = results.filter((result) => result.pass).length;

const receipt = { target: TARGET, base: TARGET === "local" ? BASE : "(deployed, behind Access)", at: new Date().toISOString(), nonce: NONCE, passed, total: results.length, ms: Date.now() - started, results };

mkdirSync("receipts", { recursive: true });

writeFileSync(`receipts/e2e-${TARGET}.json`, `${JSON.stringify(receipt, null, 2)}\n`);

console.log(`\n${passed}/${results.length} scenarios passed in ${Math.round((Date.now() - started) / 1000)} s; receipt: receipts/e2e-${TARGET}.json`);

process.exit(passed === results.length ? 0 : 1);

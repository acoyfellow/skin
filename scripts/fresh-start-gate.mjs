import { chromium, webkit } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:8790";

const headers = process.env.SKIN_SESSION === undefined ? {} : { cookie: `__Host-skin_session=${process.env.SKIN_SESSION}` };

const engines = (process.env.ENGINES ?? "chromium,webkit").split(",");

const launchers = { chromium, webkit };

const statusAfterLoad = async (page, path) => {
	const navigations = [];
	page.on("framenavigated", (frame) => frame === page.mainFrame() && navigations.push(frame.url()));
	await page.goto(BASE + path, { waitUntil: "load", timeout: 20000 });
	await page.waitForFunction(() => document.getElementById("status")?.textContent !== "Connecting", null, { timeout: 15000 }).catch(() => {});

	return {
		path,
		status: await page.evaluate(() => document.getElementById("status")?.textContent ?? "missing"),
		versions: await page.locator("[data-generation]").count(),
		navigations: navigations.length,
	};
};

const runEngine = async (name) => {
	const browser = await launchers[name].launch();
	const context = await browser.newContext({ extraHTTPHeaders: headers });
	const page = await context.newPage();
	const errors = [];
	page.on("pageerror", (error) => errors.push(String(error)));
	const results = [];

	for (const path of ["/", "/", "/c/c-gate-probe"]) results.push(await statusAfterLoad(page, path));
	await browser.close();

	return { engine: name, results, errors };
};

const failures = [];

for (const engine of engines) {
	const report = await runEngine(engine);
	console.log(JSON.stringify(report));

	for (const result of report.results) {
		if (result.status === "Connecting" || result.status === "missing") failures.push(`${engine} ${result.path}: stuck at ${result.status}`);

		if (result.versions === 0) failures.push(`${engine} ${result.path}: no versions listed`);

		if (result.navigations > 2) failures.push(`${engine} ${result.path}: ${result.navigations} navigations`);
	}

	for (const error of report.errors) failures.push(`${engine}: ${error}`);
}

if (failures.length > 0) {
	console.error(failures.join("\n"));
	process.exit(1);
}

console.log("fresh-start gate passed");

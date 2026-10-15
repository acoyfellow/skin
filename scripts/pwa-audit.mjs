const BASE = (process.env.BASE ?? "https://skin.coey.dev").replace(/\/$/, "");
const PUBLIC = process.env.EXPOSURE !== "private";

const results = [];

const check = (name, ok, detail) => {
	results.push({ name, ok, detail });
	console.log(`${ok ? "pass" : "FAIL"}  ${name}${detail ? `: ${detail}` : ""}`);
};

const get = async (path, accept = "*/*") => {
	const response = await fetch(BASE + path, { headers: { Accept: accept }, redirect: "manual" });
	const body = new Uint8Array(await response.arrayBuffer());

	return { status: response.status, type: response.headers.get("content-type") ?? "", headers: response.headers, body, text: () => new TextDecoder().decode(body) };
};

const pngSize = (bytes) => {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

	return bytes[0] === 0x89 && bytes[1] === 0x50 ? `${view.getUint32(16)}x${view.getUint32(20)}` : "not a png";
};

const page = await get("/", "text/html");
const html = page.text();

check("launch page answers 200 HTML", page.status === 200 && page.type.includes("text/html"), `${page.status} ${page.type}`);

for (const header of ["strict-transport-security", "x-content-type-options", "referrer-policy", "x-frame-options", "content-security-policy"]) check(`header ${header}`, page.headers.has(header), page.headers.get(header) ?? "missing");

if (PUBLIC) {
	for (const [label, pattern] of [
		["title", /<title>[^<]{10,70}<\/title>/],
		["meta description", /<meta name="description" content="[^"]{50,170}"/],
		["canonical", /<link rel="canonical" href="https:\/\//],
		["og:image 1200x630", /og:image:width" content="1200"/],
		["twitter card", /twitter:card" content="summary_large_image"/],
		["JSON-LD", /application\/ld\+json/],
		["robots meta allows indexing", /<meta name="robots" content="index/],
	])
		check(`launch page ${label}`, pattern.test(html), "");
}

for (const [label, pattern] of [
	["manifest link", /<link rel="manifest" href="\/manifest.webmanifest">/],
	["apple-touch-icon 180", /<link rel="apple-touch-icon" href="\/apple-touch-icon.png" sizes="180x180">/],
	["apple-mobile-web-app-capable", /apple-mobile-web-app-capable" content="yes"/],
	["apple-mobile-web-app-title", /apple-mobile-web-app-title"/],
	["status bar style", /apple-mobile-web-app-status-bar-style"/],
	["theme-color", /<meta name="theme-color"/],
])
	check(`head ${label}`, pattern.test(html), "");

const splashes = [...html.matchAll(/rel="apple-touch-startup-image" media="([^"]+)" href="([^"]+)"/g)];

check("iOS startup images linked", splashes.length >= 10, `${splashes.length} linked`);

for (const [, media, href] of splashes) {
	const image = await get(href);
	const ratio = Number(/pixel-ratio: (\d)/.exec(media)?.[1]);
	const [width, height] = [/device-width: (\d+)px/, /device-height: (\d+)px/].map((pattern) => Number(pattern.exec(media)?.[1]) * ratio);

	check(`splash ${href}`, image.status === 200 && pngSize(image.body) === `${width}x${height}`, `${image.status} ${pngSize(image.body)}, expected ${width}x${height}`);
}

const manifestResponse = await get("/manifest.webmanifest");
const manifest = manifestResponse.type.includes("json") ? JSON.parse(manifestResponse.text()) : undefined;

check("manifest served as JSON without signing in", manifest !== undefined, `${manifestResponse.status} ${manifestResponse.type}`);

if (manifest !== undefined) {
	for (const field of ["id", "name", "short_name", "description", "start_url", "scope", "display", "background_color", "theme_color", "icons", "screenshots"]) check(`manifest ${field}`, manifest[field] !== undefined, JSON.stringify(manifest[field] ?? null).slice(0, 60));

	check("manifest has a maskable icon", manifest.icons.some((icon) => icon.purpose?.includes("maskable")), "");
	check("manifest has 192 and 512 icons", ["192x192", "512x512"].every((size) => manifest.icons.some((icon) => icon.sizes === size)), "");
	check("manifest has narrow and wide screenshots", ["narrow", "wide"].every((form) => manifest.screenshots.some((shot) => shot.form_factor === form)), "");

	for (const image of [...manifest.icons, ...manifest.screenshots]) {
		const file = await get(image.src);

		check(`manifest image ${image.src}`, file.status === 200 && pngSize(file.body) === image.sizes, `${file.status} ${pngSize(file.body)}, declared ${image.sizes}`);
	}
}

for (const [path, type] of [
	["/apple-touch-icon.png", "image/png"],
	["/favicon.ico", "image/x-icon"],
	["/sw.js", "javascript"],
	["/robots.txt", "text/plain"],
]) {
	const file = await get(path);

	check(`${path} served as ${type}`, file.status === 200 && file.type.includes(type), `${file.status} ${file.type}`);
}

const apple = await get("/apple-touch-icon.png");

check("apple-touch-icon is 180x180", pngSize(apple.body) === "180x180", pngSize(apple.body));

const robotsText = (await get("/robots.txt")).text();

check(PUBLIC ? "robots.txt allows the launch page and names the sitemap" : "robots.txt disallows everything", PUBLIC ? robotsText.includes("Allow: /$") && robotsText.includes("Sitemap:") : robotsText.includes("Disallow: /"), robotsText.replace(/\n/g, " | ").slice(0, 90));

const site = await get("/sitemap.xml");

check(PUBLIC ? "sitemap.xml lists the launch page" : "sitemap.xml is absent", PUBLIC ? site.status === 200 && site.text().includes(`<loc>${BASE}/</loc>`) : site.status === 404, `${site.status}`);

const missing = await get("/this-page-does-not-exist", "text/html");

check("unknown paths are not soft 404s", missing.status !== 200, `${missing.status}`);

const passed = results.filter((result) => result.ok).length;

console.log(`\n${passed}/${results.length} PWA and SEO checks passed against ${BASE}`);
process.exit(passed === results.length ? 0 : 1);

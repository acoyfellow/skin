import { Option } from "effect";
import { BODY_SOCKET_PATH, KERNEL_PREFIX, PIN_COOKIE, REPORT_PATH } from "../shared/protocol";
import { ICON_192, ICON_512 } from "./icons.gen";

const START_TIMEOUT_MS = 5000;

export const GUARD = `(() => {
	const generation = globalThis.__GENERATION__;
	const pinned = new RegExp("(?:^|;\\\\s*)${PIN_COOKIE}=\\\\d+").test(document.cookie);
	let settled = false;
	let crashed = false;

	const started = () => [...document.body.children].some((element) => element.tagName !== "SCRIPT" && element.id !== "kernel-banner" && (element.childElementCount > 0 || element.textContent.trim() !== ""));

	const banner = (text, actions) => {
		let bar = document.getElementById("kernel-banner");

		if (bar === null) {
			bar = document.createElement("div");
			bar.id = "kernel-banner";
			bar.setAttribute("role", "status");
			bar.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;display:flex;gap:12px;align-items:center;padding:10px 14px;border-radius:10px;background:#171717;color:#fff;font:13px/1.4 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.25)";
			document.documentElement.appendChild(bar);
		}

		bar.replaceChildren();

		const label = document.createElement("span");

		label.style.flex = "1";
		label.textContent = text;
		bar.appendChild(label);

		for (const [name, run] of actions) {
			const button = document.createElement("button");

			button.textContent = name;
			button.style.cssText = "border:1px solid #555;background:transparent;color:#fff;border-radius:6px;padding:4px 10px;font:inherit;cursor:pointer";
			button.onclick = run;
			bar.appendChild(button);
		}
	};

	const report = (ok, detail) => {
		if (settled || typeof generation !== "number") return;

		settled = true;
		fetch("${REPORT_PATH}", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ generation, ok, detail: String(detail).slice(0, 1000) }), keepalive: true, credentials: "same-origin" }).catch(() => {});
	};

	const consoleLink = ["Open console", () => location.assign("${KERNEL_PREFIX}/")];

	const fail = (detail) => {
		if (crashed) return;

		crashed = true;

		const beforeStart = !settled;

		report(false, detail);
		banner(beforeStart ? "Generation " + generation + " crashed while starting. The kernel is rolling back." : "Generation " + generation + " crashed: " + String(detail).slice(0, 160), [["Reload", () => location.reload()], consoleLink]);

		if (beforeStart && !pinned) setTimeout(() => location.reload(), 2500);
	};

	addEventListener("error", (event) => {
		if (!settled) fail(event.message || String(event.error));
	});

	addEventListener("unhandledrejection", (event) => {
		if (!settled) fail("unhandled rejection: " + String(event.reason));
	});

	const consoleError = console.error.bind(console);

	console.error = (...args) => {
		consoleError(...args);

		if (typeof args[0] === "string" && args[0].includes("Application crash")) fail(String(args[1] && args[1].message ? args[1].message : args[1]));
	};

	addEventListener("load", () => setTimeout(() => (started() && !crashed ? report(true, "rendered") : fail("nothing rendered ${START_TIMEOUT_MS / 1000} s after load")), ${START_TIMEOUT_MS}));

	const listen = (attempt) => {
		const socket = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "${BODY_SOCKET_PATH}");

		socket.onmessage = (event) => {
			const frame = JSON.parse(event.data);
			const live = frame && frame._tag === "Body" ? frame.body.live : null;

			if (typeof live === "number" && live !== generation && !pinned) banner("Generation " + live + " is live.", [["Reload", () => location.reload()], consoleLink]);
		};
		socket.onclose = () => setTimeout(() => listen(attempt + 1), Math.min(30000, 1000 * 2 ** attempt));
	};

	listen(0);

	if (pinned) banner("You are viewing generation " + generation + ", not the live one.", [["Follow live", () => location.assign("${KERNEL_PREFIX}/unpin")], consoleLink]);

	if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
})();
`;

export const SERVICE_WORKER = `const CACHE = "planarian-shell-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const cacheable = (request, url) => request.mode === "navigate" || url.searchParams.has("g") || url.pathname === "/styles.css" || url.pathname.startsWith("${KERNEL_PREFIX}/icon");

self.addEventListener("fetch", (event) => {
	const request = event.request;
	const url = new URL(request.url);

	if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("${KERNEL_PREFIX}/api/")) return;

	event.respondWith(
		fetch(request)
			.then((response) => {
				if (response.ok && cacheable(request, url)) {
					const copy = response.clone();

					caches.open(CACHE).then((cache) => cache.put(request.mode === "navigate" ? "/" : request, copy));
				}

				return response;
			})
			.catch(() => caches.match(request.mode === "navigate" ? "/" : request).then((hit) => hit || Response.error())),
	);
});
`;

export const MANIFEST = JSON.stringify({
	name: "planarian",
	short_name: "planarian",
	description: "An app that rewrites its own code while you use it.",
	start_url: "/",
	scope: "/",
	display: "standalone",
	background_color: "#171717",
	theme_color: "#171717",
	icons: [
		{ src: `${KERNEL_PREFIX}/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
		{ src: `${KERNEL_PREFIX}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any maskable" },
		{ src: `${KERNEL_PREFIX}/icon.svg`, sizes: "any", type: "image/svg+xml" },
	],
});

export const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#171717"/><ellipse cx="32" cy="32" rx="19" ry="25" fill="#7c3aed"/><circle cx="27" cy="23" r="3" fill="#171717"/><circle cx="37" cy="23" r="3" fill="#171717"/></svg>`;

export const CONSOLE = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>planarian kernel console</title>
<link rel="icon" href="${KERNEL_PREFIX}/icon.svg" type="image/svg+xml">
<style>
body{font:14px/1.5 system-ui,sans-serif;margin:0 auto;max-width:860px;padding:24px;color:#171717}
h1{font-size:18px;margin:0 0 4px}p{color:#4d4d4d;margin:0 0 16px}
table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:6px 8px;border-bottom:1px solid #ebebeb;vertical-align:top}
.live{color:#107d32;font-weight:600}.rejected{color:#c41a1a}.building{color:#7c3aed}
button,a.button{font:inherit;border:1px solid #d4d4d4;background:#fff;border-radius:6px;padding:2px 8px;cursor:pointer;color:inherit;text-decoration:none}
pre{white-space:pre-wrap;margin:4px 0 0;font-size:12px;color:#c41a1a}
</style>
<h1>Kernel console</h1>
<p>The kernel cannot be edited by the agent. Use this page if the app itself stops working: roll back to any generation that passed the gate, or open one to look at it.</p>
<p><a class="button" href="/">Open the live app</a> <a class="button" href="${KERNEL_PREFIX}/unpin">Follow live</a> <button id="reseed">Reset the draft to the factory seed</button></p>
<table><thead><tr><th>#</th><th>Change</th><th>Status</th><th>Browser</th><th></th></tr></thead><tbody id="rows"><tr><td colspan="5">Loading…</td></tr></tbody></table>
<script>
const rows = document.getElementById("rows");
const cell = (text, className) => { const td = document.createElement("td"); td.textContent = text; if (className) td.className = className; return td; };
const action = (label, run) => { const button = document.createElement("button"); button.textContent = label; button.onclick = run; return button; };
const post = (path) => fetch(path, { method: "POST" }).then((response) => response.text()).then((text) => { alert(text); load(); });
const load = () => fetch("${KERNEL_PREFIX}/api/body").then((response) => response.json()).then((state) => {
	rows.replaceChildren();
	for (const generation of state.generations) {
		const row = document.createElement("tr");
		const change = cell(generation.message);
		if (generation.status === "rejected") { const pre = document.createElement("pre"); pre.textContent = generation.note; change.appendChild(pre); }
		const actions = document.createElement("td");
		if (generation.status === "retired") actions.appendChild(action("Roll back", () => post("${KERNEL_PREFIX}/api/rollback/" + generation.id)));
		if (generation.status === "retired" || generation.status === "live") { const open = document.createElement("a"); open.className = "button"; open.href = "${KERNEL_PREFIX}/pin/" + generation.id; open.textContent = "Open"; actions.appendChild(open); }
		row.append(cell(String(generation.id)), change, cell(generation.status, generation.status), cell(generation.boots + " started, " + generation.crashes + " crashed"), actions);
		rows.appendChild(row);
	}
	if (state.generations.length === 0) rows.innerHTML = "<tr><td colspan=5>No generations yet. Open the app to grow the first one.</td></tr>";
});
document.getElementById("reseed").onclick = () => confirm("Replace the draft with the factory seed? The live generation is not changed until you ship.") && post("${KERNEL_PREFIX}/api/reseed");
load();
</script>
</html>
`;

const decodeBase64 = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

const respond = (body: BodyInit, type: string, cache = "no-cache") => new Response(body, { headers: { "content-type": type, "cache-control": cache } });

const STATIC: Readonly<Record<string, () => Response>> = {
	"/sw.js": () => respond(SERVICE_WORKER, "text/javascript; charset=utf-8"),
	"/manifest.webmanifest": () => respond(MANIFEST, "application/manifest+json"),
	[`${KERNEL_PREFIX}/guard.js`]: () => respond(GUARD, "text/javascript; charset=utf-8"),
	[`${KERNEL_PREFIX}/icon.svg`]: () => respond(ICON_SVG, "image/svg+xml", "public, max-age=86400"),
	[`${KERNEL_PREFIX}/icon-192.png`]: () => respond(decodeBase64(ICON_192), "image/png", "public, max-age=86400"),
	[`${KERNEL_PREFIX}/icon-512.png`]: () => respond(decodeBase64(ICON_512), "image/png", "public, max-age=86400"),
	[`${KERNEL_PREFIX}/`]: () => respond(CONSOLE, "text/html; charset=utf-8"),
	[KERNEL_PREFIX]: () => respond(CONSOLE, "text/html; charset=utf-8"),
	[`${KERNEL_PREFIX}/unpin`]: () => new Response(null, { status: 302, headers: { location: "/", "set-cookie": `${PIN_COOKIE}=; Path=/; Max-Age=0; Secure; SameSite=Lax` } }),
};

const PIN_ROUTE = /^\/_kernel\/pin\/(\d+)$/;

export const kernelAsset = (pathname: string): Option.Option<Response> => {
	const fixed = STATIC[pathname];

	if (fixed !== undefined) return Option.some(fixed());

	const pin = PIN_ROUTE.exec(pathname)?.[1];

	return pin === undefined ? Option.none() : Option.some(new Response(null, { status: 302, headers: { location: "/", "set-cookie": `${PIN_COOKIE}=${pin}; Path=/; Secure; SameSite=Lax` } }));
};

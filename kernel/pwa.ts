import { Option } from "effect";
import { KERNEL_PREFIX } from "../shared/protocol";
import APPLE_TOUCH_ICON from "./assets/apple-touch-icon.png";
import FAVICON from "./assets/favicon.ico";
import HERO_320 from "./assets/hero-320.webp";
import HERO_640 from "./assets/hero-640.webp";
import ICON_32 from "./assets/icon-32.png";
import ICON_64 from "./assets/icon-64.png";
import ICON_MASKABLE from "./assets/icon-maskable-512.png";
import OG from "./assets/og.jpg";
import SCREENSHOT_NARROW from "./assets/screenshot-narrow.png";
import SCREENSHOT_WIDE from "./assets/screenshot-wide.png";
import SPLASH_750 from "./assets/splash/750x1334.png";
import SPLASH_828 from "./assets/splash/828x1792.png";
import SPLASH_1125 from "./assets/splash/1125x2436.png";
import SPLASH_1170 from "./assets/splash/1170x2532.png";
import SPLASH_1179 from "./assets/splash/1179x2556.png";
import SPLASH_1206 from "./assets/splash/1206x2622.png";
import SPLASH_1242 from "./assets/splash/1242x2688.png";
import SPLASH_1284 from "./assets/splash/1284x2778.png";
import SPLASH_1290 from "./assets/splash/1290x2796.png";
import SPLASH_1320 from "./assets/splash/1320x2868.png";
import SPLASH_1640 from "./assets/splash/1640x2360.png";
import SPLASH_1668 from "./assets/splash/1668x2388.png";
import SPLASH_2048 from "./assets/splash/2048x2732.png";

export const APP_NAME = "skin";

export const APP_DESCRIPTION = "Your own app with an agent inside. Ask for a change in plain words; it rewrites itself and only goes live if it works.";

export const THEME_COLOR = "#171717";

export const SPLASH_BACKGROUND = "#272d3f";

const WEEK = "public, max-age=604800, stale-while-revalidate=86400";

type Splash = { readonly width: number; readonly height: number; readonly deviceWidth: number; readonly deviceHeight: number; readonly ratio: number; readonly image: ArrayBuffer };

const SPLASHES: ReadonlyArray<Splash> = [
	{ width: 1320, height: 2868, deviceWidth: 440, deviceHeight: 956, ratio: 3, image: SPLASH_1320 },
	{ width: 1206, height: 2622, deviceWidth: 402, deviceHeight: 874, ratio: 3, image: SPLASH_1206 },
	{ width: 1290, height: 2796, deviceWidth: 430, deviceHeight: 932, ratio: 3, image: SPLASH_1290 },
	{ width: 1179, height: 2556, deviceWidth: 393, deviceHeight: 852, ratio: 3, image: SPLASH_1179 },
	{ width: 1284, height: 2778, deviceWidth: 428, deviceHeight: 926, ratio: 3, image: SPLASH_1284 },
	{ width: 1170, height: 2532, deviceWidth: 390, deviceHeight: 844, ratio: 3, image: SPLASH_1170 },
	{ width: 1125, height: 2436, deviceWidth: 375, deviceHeight: 812, ratio: 3, image: SPLASH_1125 },
	{ width: 1242, height: 2688, deviceWidth: 414, deviceHeight: 896, ratio: 3, image: SPLASH_1242 },
	{ width: 828, height: 1792, deviceWidth: 414, deviceHeight: 896, ratio: 2, image: SPLASH_828 },
	{ width: 750, height: 1334, deviceWidth: 375, deviceHeight: 667, ratio: 2, image: SPLASH_750 },
	{ width: 2048, height: 2732, deviceWidth: 1024, deviceHeight: 1366, ratio: 2, image: SPLASH_2048 },
	{ width: 1668, height: 2388, deviceWidth: 834, deviceHeight: 1194, ratio: 2, image: SPLASH_1668 },
	{ width: 1640, height: 2360, deviceWidth: 820, deviceHeight: 1180, ratio: 2, image: SPLASH_1640 },
];

const splashPath = (splash: Splash) => `${KERNEL_PREFIX}/splash/${splash.width}x${splash.height}.png`;

const splashLink = (splash: Splash) =>
	`<link rel="apple-touch-startup-image" media="screen and (device-width: ${splash.deviceWidth}px) and (device-height: ${splash.deviceHeight}px) and (-webkit-device-pixel-ratio: ${splash.ratio}) and (orientation: portrait)" href="${splashPath(splash)}">`;

export const PWA_HEAD = [
	`<link rel="manifest" href="/manifest.webmanifest">`,
	`<meta name="application-name" content="${APP_NAME}">`,
	`<meta name="theme-color" content="${THEME_COLOR}">`,
	`<meta name="mobile-web-app-capable" content="yes">`,
	`<meta name="apple-mobile-web-app-capable" content="yes">`,
	`<meta name="apple-mobile-web-app-title" content="${APP_NAME}">`,
	`<meta name="apple-mobile-web-app-status-bar-style" content="default">`,
	`<meta name="format-detection" content="telephone=no">`,
	`<link rel="icon" href="/favicon.ico" sizes="48x48">`,
	`<link rel="icon" href="${KERNEL_PREFIX}/icon-32.png" type="image/png" sizes="32x32">`,
	`<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">`,
	...SPLASHES.map(splashLink),
].join("");

export const MANIFEST = JSON.stringify({
	id: "/",
	name: APP_NAME,
	short_name: APP_NAME,
	description: APP_DESCRIPTION,
	lang: "en",
	dir: "ltr",
	start_url: "/",
	scope: "/",
	display: "standalone",
	display_override: ["standalone", "minimal-ui"],
	orientation: "any",
	background_color: SPLASH_BACKGROUND,
	theme_color: THEME_COLOR,
	categories: ["productivity", "utilities", "developer"],
	icons: [
		{ src: `${KERNEL_PREFIX}/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
		{ src: `${KERNEL_PREFIX}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
		{ src: `${KERNEL_PREFIX}/icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
		{ src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png", purpose: "any" },
	],
	screenshots: [
		{ src: `${KERNEL_PREFIX}/screenshot-narrow.png`, sizes: "1170x2532", type: "image/png", form_factor: "narrow", label: "Your app, with its agent a tap away" },
		{ src: `${KERNEL_PREFIX}/screenshot-wide.png`, sizes: "2560x1600", type: "image/png", form_factor: "wide", label: "Your app, its chats, and every version" },
	],
	shortcuts: [{ name: "New chat", short_name: "New chat", url: "/", icons: [{ src: `${KERNEL_PREFIX}/icon-192.png`, sizes: "192x192" }] }],
});

const respond = (body: BodyInit, type: string, cache: string) => new Response(body, { headers: { "content-type": type, "cache-control": cache } });

const ROUTES = new Map<string, () => Response>([
	["/manifest.webmanifest", () => respond(MANIFEST, "application/manifest+json", "public, max-age=3600")],
	["/favicon.ico", () => respond(FAVICON, "image/x-icon", WEEK)],
	["/apple-touch-icon.png", () => respond(APPLE_TOUCH_ICON, "image/png", WEEK)],
	["/apple-touch-icon-precomposed.png", () => respond(APPLE_TOUCH_ICON, "image/png", WEEK)],
	[`${KERNEL_PREFIX}/icon-32.png`, () => respond(ICON_32, "image/png", WEEK)],
	[`${KERNEL_PREFIX}/icon-64.png`, () => respond(ICON_64, "image/png", WEEK)],
	[`${KERNEL_PREFIX}/icon-maskable-512.png`, () => respond(ICON_MASKABLE, "image/png", WEEK)],
	[`${KERNEL_PREFIX}/hero-320.webp`, () => respond(HERO_320, "image/webp", WEEK)],
	[`${KERNEL_PREFIX}/hero-640.webp`, () => respond(HERO_640, "image/webp", WEEK)],
	[`${KERNEL_PREFIX}/og.jpg`, () => respond(OG, "image/jpeg", WEEK)],
	[`${KERNEL_PREFIX}/screenshot-narrow.png`, () => respond(SCREENSHOT_NARROW, "image/png", WEEK)],
	[`${KERNEL_PREFIX}/screenshot-wide.png`, () => respond(SCREENSHOT_WIDE, "image/png", WEEK)],
	...SPLASHES.map((splash): [string, () => Response] => [splashPath(splash), () => respond(splash.image, "image/png", WEEK)]),
]);

export const pwaAsset = (pathname: string): Option.Option<Response> => Option.fromNullishOr(ROUTES.get(pathname)?.());

export const robots = (origin: string): Response =>
	new Response(["User-agent: *", "Allow: /$", "Allow: /_kernel/", "Disallow: /", "", `Sitemap: ${origin}/sitemap.xml`, ""].join("\n"), {
		headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
	});

export const sitemap = (origin: string): Response =>
	new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url></urlset>\n`, {
		headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" },
	});

export const socialHead = (origin: string): string =>
	[
		`<link rel="canonical" href="${origin}/">`,
		`<meta property="og:type" content="website">`,
		`<meta property="og:site_name" content="${APP_NAME}">`,
		`<meta property="og:url" content="${origin}/">`,
		`<meta property="og:title" content="${APP_NAME} · an app you change by asking">`,
		`<meta property="og:description" content="${APP_DESCRIPTION}">`,
		`<meta property="og:image" content="${origin}${KERNEL_PREFIX}/og.jpg">`,
		`<meta property="og:image:width" content="1200">`,
		`<meta property="og:image:height" content="630">`,
		`<meta property="og:image:alt" content="The skin app icon beside soft violet membranes">`,
		`<meta name="twitter:card" content="summary_large_image">`,
		`<meta name="twitter:title" content="${APP_NAME} · an app you change by asking">`,
		`<meta name="twitter:description" content="${APP_DESCRIPTION}">`,
		`<meta name="twitter:image" content="${origin}${KERNEL_PREFIX}/og.jpg">`,
		`<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "WebApplication", name: APP_NAME, url: `${origin}/`, description: APP_DESCRIPTION, applicationCategory: "ProductivityApplication", operatingSystem: "Any", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } })}</script>`,
	].join("");

const SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
	["strict-transport-security", "max-age=31536000; includeSubDomains"],
	["x-content-type-options", "nosniff"],
	["referrer-policy", "strict-origin-when-cross-origin"],
	["permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()"],
	["x-frame-options", "DENY"],
	["content-security-policy", "frame-ancestors 'none'; base-uri 'self'; object-src 'none'"],
];

export const harden = (response: Response, indexable: boolean): Response => {
	if (response.status === 101 || response.webSocket !== null) return response;

	const headers = new Headers(response.headers);

	for (const [name, value] of SECURITY_HEADERS) if (!headers.has(name)) headers.set(name, value);

	if (!indexable) headers.set("x-robots-tag", "noindex, nofollow");

	return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

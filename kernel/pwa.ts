import { Option } from "effect";
import { KERNEL_PREFIX } from "../shared/protocol";
import APPLE_TOUCH_ICON from "./assets/apple-touch-icon.png";
import FAVICON from "./assets/favicon.ico";
import HERO_320 from "./assets/hero-320.webp";
import HERO_640 from "./assets/hero-640.webp";
import ICON_32 from "./assets/icon-32.png";
import ICON_64 from "./assets/icon-64.png";
import ICON_48 from "./assets/icon-48.png";
import ICON_72 from "./assets/icon-72.png";
import ICON_96 from "./assets/icon-96.png";
import ICON_128 from "./assets/icon-128.png";
import ICON_144 from "./assets/icon-144.png";
import ICON_152 from "./assets/icon-152.png";
import ICON_384 from "./assets/icon-384.png";
import ICON_MASKABLE_192 from "./assets/icon-maskable-192.png";
import SPLASH_2732_LAND from "./assets/splash/2732x2048.png";
import SPLASH_2388_LAND from "./assets/splash/2388x1668.png";
import SPLASH_2360_LAND from "./assets/splash/2360x1640.png";
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

export const APP_TITLE = "skin: an app you change by asking, on Cloudflare";

export const SHARE_TITLE = "skin · an app you change by asking";

type Question = { readonly question: string; readonly answer: string };

export const FAQ: ReadonlyArray<Question> = [
	{ question: "What is skin?", answer: "Your own copy of a web app with an AI agent inside it. You ask for a change in plain words, the agent edits the app's code, and the new version goes live only after it builds, boots, and passes its checks." },
	{ question: "Who pays for the AI?", answer: "You do, on your own Cloudflare account. Every model call uses your sign-in, through Workers AI or an AI Gateway you own. skin never pays for your tokens and never holds a provider key." },
	{ question: "Which models can I use?", answer: "Open models on Workers AI, such as GLM and Llama, or Claude and GPT through your own authenticated AI Gateway. You can switch any time with Cmd+K." },
	{ question: "What if a change breaks the app?", answer: "A version that fails its build, boot, or checks never goes live. Every earlier version stays in the console, one click from rollback, and you can reset to the original." },
	{ question: "What does signing in give skin access to?", answer: "Only what Cloudflare's consent screen lists for the account you pick. Signing out ends the session and revokes skin's access." },
	{ question: "What does skin run on?", answer: "Cloudflare Workers, Durable Objects, and the Worker Loader. Each person gets their own app, chats, and version history." },
];

export const THEME_COLOR = "#171717";

export const SPLASH_BACKGROUND = "#272d3f";

const ICON_SIZES = [48, 72, 96, 128, 144, 152] as const;

const ICONS_BY_SIZE: ReadonlyArray<readonly [number, ArrayBuffer]> = [[48, ICON_48], [72, ICON_72], [96, ICON_96], [128, ICON_128], [144, ICON_144], [152, ICON_152], [384, ICON_384]];

const WEEK = "public, max-age=604800, stale-while-revalidate=86400";

type Orientation = "portrait" | "landscape";

type Splash = { readonly width: number; readonly height: number; readonly deviceWidth: number; readonly deviceHeight: number; readonly ratio: number; readonly image: ArrayBuffer; readonly orientation?: Orientation };

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
	{ width: 2732, height: 2048, deviceWidth: 1024, deviceHeight: 1366, ratio: 2, image: SPLASH_2732_LAND, orientation: "landscape" },
	{ width: 2388, height: 1668, deviceWidth: 834, deviceHeight: 1194, ratio: 2, image: SPLASH_2388_LAND, orientation: "landscape" },
	{ width: 2360, height: 1640, deviceWidth: 820, deviceHeight: 1180, ratio: 2, image: SPLASH_2360_LAND, orientation: "landscape" },
];

const splashPath = (splash: Splash) => `${KERNEL_PREFIX}/splash/${splash.width}x${splash.height}.png`;

const splashLink = (splash: Splash) =>
	`<link rel="apple-touch-startup-image" media="screen and (device-width: ${splash.deviceWidth}px) and (device-height: ${splash.deviceHeight}px) and (-webkit-device-pixel-ratio: ${splash.ratio}) and (orientation: ${splash.orientation ?? "portrait"})" href="${splashPath(splash)}">`;

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
	`<link rel="icon" href="${KERNEL_PREFIX}/icon-192.png" type="image/png" sizes="192x192">`,
	`<link rel="apple-touch-icon" href="${KERNEL_PREFIX}/icon-152.png" sizes="152x152">`,
	`<meta name="msapplication-TileColor" content="${SPLASH_BACKGROUND}">`,
	`<meta name="msapplication-TileImage" content="${KERNEL_PREFIX}/icon-144.png">`,
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
	prefer_related_applications: false,
	launch_handler: { client_mode: ["navigate-existing", "auto"] },
	icons: [
		...ICON_SIZES.map((size) => ({ src: `${KERNEL_PREFIX}/icon-${size}.png`, sizes: `${size}x${size}`, type: "image/png", purpose: "any" })),
		{ src: `${KERNEL_PREFIX}/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
		{ src: `${KERNEL_PREFIX}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
		{ src: `${KERNEL_PREFIX}/icon-384.png`, sizes: "384x384", type: "image/png", purpose: "any" },
		{ src: `${KERNEL_PREFIX}/icon-maskable-192.png`, sizes: "192x192", type: "image/png", purpose: "maskable" },
		{ src: `${KERNEL_PREFIX}/icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
		{ src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png", purpose: "any" },
	],
	screenshots: [
		{ src: `${KERNEL_PREFIX}/screenshot-narrow.png`, sizes: "1170x2532", type: "image/png", form_factor: "narrow", label: "Your app, with its agent a tap away" },
		{ src: `${KERNEL_PREFIX}/screenshot-wide.png`, sizes: "2560x1600", type: "image/png", form_factor: "wide", label: "Your app, its chats, and every version" },
	],
	shortcuts: [
		{ name: "New chat", short_name: "New chat", description: "Ask your app for a change", url: "/", icons: [{ src: `${KERNEL_PREFIX}/icon-96.png`, sizes: "96x96", type: "image/png" }] },
		{ name: "Settings", short_name: "Settings", description: "Account, route, and model", url: "/?settings=open", icons: [{ src: `${KERNEL_PREFIX}/icon-96.png`, sizes: "96x96", type: "image/png" }] },
		{ name: "Versions", short_name: "Versions", description: "Every version and what checked it", url: `${KERNEL_PREFIX}/`, icons: [{ src: `${KERNEL_PREFIX}/icon-96.png`, sizes: "96x96", type: "image/png" }] },
	],
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
	[`${KERNEL_PREFIX}/icon-maskable-192.png`, () => respond(ICON_MASKABLE_192, "image/png", WEEK)],
	...ICONS_BY_SIZE.map(([size, image]): [string, () => Response] => [`${KERNEL_PREFIX}/icon-${size}.png`, () => respond(image, "image/png", WEEK)]),
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

const SITE_UPDATED = "2026-10-17";

export const sitemap = (origin: string): Response =>
	new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/</loc><lastmod>${SITE_UPDATED}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url></urlset>\n`, {
		headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" },
	});

const structuredData = (origin: string) => ({
	"@context": "https://schema.org",
	"@graph": [
		{
			"@type": "WebApplication",
			"@id": `${origin}/#app`,
			name: APP_NAME,
			url: `${origin}/`,
			description: APP_DESCRIPTION,
			image: `${origin}${KERNEL_PREFIX}/og.jpg`,
			screenshot: `${origin}${KERNEL_PREFIX}/screenshot-wide.png`,
			applicationCategory: "DeveloperApplication",
			operatingSystem: "Any",
			browserRequirements: "Requires JavaScript and a Cloudflare account",
			isAccessibleForFree: true,
			offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
			author: { "@id": `${origin}/#author` },
		},
		{ "@type": "Person", "@id": `${origin}/#author`, name: "Jordan Coeyman", url: "https://coey.dev", sameAs: ["https://x.com/acoyfellow", "https://github.com/acoyfellow"] },
		{ "@type": "WebSite", "@id": `${origin}/#site`, name: APP_NAME, url: `${origin}/`, inLanguage: "en", publisher: { "@id": `${origin}/#author` } },
		{ "@type": "FAQPage", "@id": `${origin}/#faq`, mainEntity: FAQ.map(({ question, answer }) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) },
	],
});

export const socialHead = (origin: string): string =>
	[
		`<link rel="canonical" href="${origin}/">`,
		`<meta property="og:type" content="website">`,
		`<meta property="og:site_name" content="${APP_NAME}">`,
		`<meta property="og:url" content="${origin}/">`,
		`<meta property="og:title" content="${SHARE_TITLE}">`,
		`<meta property="og:description" content="${APP_DESCRIPTION}">`,
		`<meta property="og:image" content="${origin}${KERNEL_PREFIX}/og.jpg">`,
		`<meta property="og:image:width" content="1200">`,
		`<meta property="og:image:height" content="630">`,
		`<meta property="og:image:alt" content="An app you change by asking. skin.coey.dev">`,
		`<meta property="og:image:type" content="image/jpeg">`,
		`<meta property="og:locale" content="en_US">`,
		`<meta name="twitter:card" content="summary_large_image">`,
		`<meta name="twitter:title" content="${SHARE_TITLE}">`,
		`<meta name="twitter:description" content="${APP_DESCRIPTION}">`,
		`<meta name="twitter:image" content="${origin}${KERNEL_PREFIX}/og.jpg">`,
		`<meta name="twitter:image:alt" content="An app you change by asking. skin.coey.dev">`,
		`<meta name="twitter:creator" content="@acoyfellow">`,
		`<script type="application/ld+json">${JSON.stringify(structuredData(origin))}</script>`,
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

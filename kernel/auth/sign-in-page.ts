import { Option } from "effect";
import { PWA_HEAD, socialHead } from "../pwa";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

type Point = { readonly title: string; readonly body: string };

const POINTS: ReadonlyArray<Point> = [
  {
    title: "An app that rewrites itself",
    body: "Ask for a change in plain words. The agent edits the app's own code while you keep using it.",
  },
  {
    title: "Nothing ships unless it works",
    body: "Each version is built, booted, and checked first. A version that fails never goes live, and every earlier one stays one click away.",
  },
  {
    title: "Your inference, your account",
    body: "Every model call runs on Workers AI in the Cloudflare account you pick, under your limits and your logs.",
  },
];

const STEPS: ReadonlyArray<string> = [
  "Pick an account on Cloudflare&rsquo;s consent screen.",
  "skin runs its agent on that account&rsquo;s Workers AI.",
  "Your app and your chats stay yours. Sign out revokes access.",
];

export const signInPage = (
  origin: string,
  error: Option.Option<string>,
) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>skin · an app you change by asking</title>
<meta name="description" content="skin is a personal app with an agent inside. Ask for a change and it rewrites itself, and only goes live if it works.">
<meta name="robots" content="index, follow">
${socialHead(origin)}
${PWA_HEAD}
<link rel="preload" as="image" href="/_kernel/hero-640.webp" type="image/webp" fetchpriority="high">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wght@6..144,300..700&display=optional" media="print" onload="this.media='all'">
<style>
:root { --bg: #ffffff; --panel: #fafafa; --line: #ebebeb; --ink: #171717; --dim: #4d4d4d; --faint: #737373; --life: #7c3aed; --bad: #c41a1a; --bad-soft: #fff0f0; }
@media (prefers-color-scheme: dark) { :root { --bg: #0a0a0a; --panel: #111111; --line: #242424; --ink: #ededed; --dim: #a1a1a1; --faint: #8f8f8f; --life: #b79cff; --bad: #ff6166; --bad-soft: #2a1011; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.6 "Google Sans Flex", ui-sans-serif, system-ui, sans-serif; }
main { max-width: 1040px; margin: 0 auto; padding: 48px 24px 64px; display: grid; gap: 40px; }
header { display: flex; align-items: center; gap: 10px; font-weight: 600; }
header img { border-radius: 7px; }
.hero { display: grid; gap: 32px; align-items: center; grid-template-columns: minmax(0, 1fr) 320px; }
@media (max-width: 760px) { .hero { grid-template-columns: 1fr; } .hero img.art { max-width: 280px; } }
h1 { font-size: clamp(32px, 5vw, 52px); line-height: 1.05; letter-spacing: -0.03em; margin: 0 0 16px; font-weight: 650; }
h1 span { color: var(--life); }
.lede { color: var(--dim); font-size: 18px; max-width: 52ch; margin: 0 0 28px; }
.cta { display: inline-flex; align-items: center; gap: 10px; background: var(--ink); color: var(--bg); text-decoration: none; font-weight: 600; padding: 13px 20px; border-radius: 10px; }
.cta:focus-visible { outline: 2px solid var(--life); outline-offset: 3px; }
.art { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 20px; }
.error { border: 1px solid var(--bad); background: var(--bad-soft); color: var(--bad); padding: 10px 14px; border-radius: 10px; margin: 0 0 20px; }
ul.points { list-style: none; padding: 0; margin: 0; display: grid; gap: 20px; grid-template-columns: repeat(3, minmax(0, 1fr)); border-top: 1px solid var(--line); padding-top: 28px; }
@media (max-width: 760px) { ul.points { grid-template-columns: 1fr; } }
ul.points strong { display: block; margin-bottom: 4px; }
ul.points span { color: var(--dim); font-size: 14px; }
ol.steps { color: var(--dim); font-size: 14px; padding-left: 20px; margin: 18px 0 0; }
footer { color: var(--faint); font-size: 13px; }
footer a { color: inherit; }
</style>
</head>
<body>
<main>
<header><img src="/_kernel/icon-64.png" alt="" width="28" height="28">skin</header>
<section class="hero">
<div>
<h1>An app you change <span>by asking.</span></h1>
<p class="lede">skin is your own copy of an app with an agent inside. Tell it what you want and it rewrites itself. A new version only goes live if it builds, boots, and passes its checks.</p>
${Option.match(error, { onNone: () => "", onSome: (message) => `<p class="error" role="alert">${escapeHtml(message)}</p>` })}
<a class="cta" href="/oauth/login">Sign in with Cloudflare</a>
<ol class="steps">${STEPS.map((step) => `<li>${step}</li>`).join("")}</ol>
</div>
<img class="art" src="/_kernel/hero-640.webp" srcset="/_kernel/hero-320.webp 320w, /_kernel/hero-640.webp 640w" sizes="(max-width: 760px) 280px, 320px" alt="Soft violet membranes, the skin artwork" width="320" height="320" fetchpriority="high" decoding="async">
</section>
<ul class="points">${POINTS.map(({ title, body }) => `<li><strong>${title}</strong><span>${body}</span></li>`).join("")}</ul>
<footer>Chat held to <a href="https://github.com/acoyfellow/basic">Basic</a>, the conformance suite for agent chat.</footer>
</main>
</body>
</html>`;

import { KERNEL_PREFIX } from "../shared/protocol";
import { PWA_HEAD } from "./pwa";
import type { Day, InstanceStats, Tally } from "./stats";

const ENTITIES: ReadonlyArray<readonly [string, string]> = [
	["&", "&amp;"],
	["<", "&lt;"],
	[">", "&gt;"],
	["\"", "&quot;"],
];

const escapeHtml = (value: string): string => ENTITIES.reduce((text, [from, to]) => text.replaceAll(from, to), value);

const whole = new Intl.NumberFormat("en-US");

const sinceLabel = (firstAt: number | null, now: number): string => {
	if (firstAt === null) return "no activity recorded yet";

	const days = Math.max(1, Math.round((now - firstAt) / 86_400_000));

	return `counting for ${whole.format(days)} day${days === 1 ? "" : "s"}`;
};

export const agoLabel = (at: number | null, now: number): string => {
	if (at === null) return "never";

	const minutes = Math.round((now - at) / 60_000);

	if (minutes < 1) return "just now";

	if (minutes < 60) return `${minutes} min ago`;

	if (minutes < 1440) return `${Math.round(minutes / 60)} h ago`;

	return `${Math.round(minutes / 1440)} d ago`;
};

const tile = (value: number, label: string, live = false): string => `<div class="tile${live ? " live" : ""}"><b>${whole.format(value)}</b><span>${escapeHtml(label)}</span></div>`;

const CHART_HEIGHT = 120;

const chart = (days: ReadonlyArray<Day>): string => {
	const peak = Math.max(1, ...days.map((day) => day.messages));
	const width = 100 / Math.max(1, days.length);

	const bars = days
		.map((day, index) => {
			const height = Math.max(day.messages === 0 ? 0 : 3, (day.messages / peak) * CHART_HEIGHT);

			return `<rect x="${(index * width + width * 0.12).toFixed(2)}%" y="${CHART_HEIGHT - height}" width="${(width * 0.76).toFixed(2)}%" height="${height}"><title>${day.day}: ${day.messages} message${day.messages === 1 ? "" : "s"}, ${day.people} ${day.people === 1 ? "person" : "people"}</title></rect>`;
		})
		.join("");

	return `<svg class="chart" viewBox="0 0 100 ${CHART_HEIGHT}" preserveAspectRatio="none" role="img" aria-label="Messages per day, last ${days.length} days">${bars}</svg><div class="axis"><span>${days[0]?.day ?? ""}</span><span>peak ${peak}/day</span><span>today</span></div>`;
};

const bars = (rows: ReadonlyArray<Tally>): string => {
	const peak = Math.max(1, ...rows.map((row) => row.count));

	return rows.length === 0
		? `<p class="faint">Nothing yet.</p>`
		: `<ul class="bars">${rows.map((row) => `<li><span class="name">${escapeHtml(row.label)}</span><span class="track"><i style="width:${((row.count / peak) * 100).toFixed(1)}%"></i></span><span class="n">${whole.format(row.count)}</span></li>`).join("")}</ul>`;
};

const STYLE = `
:root{--bg:#fff;--panel:#fafafa;--line:#ebebeb;--ink:#171717;--dim:#4d4d4d;--faint:#737373;--life:#7c3aed}
@media (prefers-color-scheme:dark){:root{--bg:#0a0a0a;--panel:#111;--line:#242424;--ink:#ededed;--dim:#a1a1a1;--faint:#8f8f8f;--life:#b79cff}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 ui-sans-serif,system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:960px;margin:0 auto;padding:32px 20px 64px}
header{display:flex;align-items:center;justify-content:space-between;margin-bottom:28px}
header a{color:inherit;text-decoration:none;display:flex;align-items:center;gap:10px;font-weight:600}
header img{border-radius:6px}
header nav a{color:var(--dim);font-weight:400}
h1{font-size:24px;letter-spacing:-.02em;margin:0 0 4px;font-weight:600}
.sub{color:var(--dim);margin:0 0 24px}
.tiles{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:24px}
@media (min-width:640px){.tiles{grid-template-columns:repeat(4,1fr)}}
.tile{border:1px solid var(--line);border-radius:10px;padding:14px 16px;background:var(--panel)}
.tile b{display:block;font-size:26px;line-height:1.15;letter-spacing:-.02em;font-variant-numeric:tabular-nums;font-weight:600}
.tile span{color:var(--dim);font-size:13px}
.tile.live b{color:var(--life)}
section{border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin-bottom:16px;background:var(--panel)}
section h2{font-size:13px;margin:0 0 12px;color:var(--dim);font-weight:500}
.chart{width:100%;height:140px;display:block}
.chart rect{fill:var(--life)}
.axis{display:flex;justify-content:space-between;color:var(--faint);font-size:12px;margin-top:6px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
.grid section{margin:0}
.bars{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.bars li{display:grid;grid-template-columns:minmax(0,9rem) 1fr 3rem;gap:10px;align-items:center;font-size:13px}
.bars .name{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bars .track{height:6px;border-radius:99px;background:var(--line)}
.bars i{display:block;height:100%;border-radius:99px;background:var(--life)}
.bars .n{text-align:right;color:var(--dim);font-variant-numeric:tabular-nums}
.faint{color:var(--faint)}
footer{color:var(--faint);font-size:13px;margin-top:24px;display:flex;gap:16px;flex-wrap:wrap}
footer a{color:var(--dim)}`;

export const statsPage = (stats: InstanceStats, origin: string): string => {
	const host = new URL(origin).host;

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(host)} stats · skin</title>
<meta name="description" content="Live totals for skin at ${escapeHtml(host)}: people, chats, messages, versions shipped and blocked, and tools used.">
<link rel="canonical" href="${origin}/stats">
<meta http-equiv="refresh" content="60">
${PWA_HEAD}
<style>${STYLE}</style>
</head>
<body>
<main>
<header><a href="/"><img src="${KERNEL_PREFIX}/icon-64.png" alt="" width="24" height="24">skin</a><nav><a href="/stats.json">stats.json</a></nav></header>
<h1>${escapeHtml(host)}</h1>
<p class="sub">skin at a glance · ${escapeHtml(sinceLabel(stats.firstAt, stats.at))} · last activity ${escapeHtml(agoLabel(stats.lastAt, stats.at))}</p>
<div class="tiles">
${tile(stats.people, stats.people === 1 ? "person signed in" : "people signed in")}
${tile(stats.activeToday, "active today", stats.activeToday > 0)}
${tile(stats.active7d, "active this week")}
${tile(stats.chats, "chats")}
${tile(stats.messages, "messages")}
${tile(stats.shipsLive, "versions shipped")}
${tile(stats.shipsBlocked, "versions blocked by the gate")}
${tile(stats.toolCalls, "tool calls")}
</div>
<section><h2>Messages per day, last ${stats.perDay.length} days</h2>${chart(stats.perDay)}</section>
<div class="grid">
<section><h2>Models used</h2>${bars(stats.models)}</section>
<section><h2>Routes chosen</h2>${bars(stats.routes)}</section>
<section><h2>Tools the agent called</h2>${bars(stats.tools)}</section>
</div>
<footer><span>Totals only: no names, emails, accounts, chat titles, or content. Updates every minute.</span><a href="/stats.json">stats.json</a><a href="/">Get your own skin</a></footer>
</main>
</body>
</html>`;
};

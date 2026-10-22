import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { agoLabel, statsPage } from "./stats-page";
import { DAY_MS, fillDays, type InstanceStats, lastDays, modelLabel, routeLabel, topTallies } from "./stats";

const NOW = Date.UTC(2026, 9, 18, 12);

const STATS: InstanceStats = {
	people: 3,
	activeToday: 1,
	active7d: 2,
	chats: 5,
	messages: 40,
	shipsLive: 6,
	shipsBlocked: 2,
	rollbacks: 1,
	toolCalls: 90,
	firstAt: NOW - 3 * DAY_MS,
	lastAt: NOW - 120_000,
	perDay: fillDays(NOW, new Map([["2026-10-18", { messages: 12, people: 1 }]])),
	models: [{ label: "glm-5.3", count: 30 }],
	routes: [{ label: "AI Gateway", count: 2 }],
	tools: [{ label: "web_fetch", count: 9 }],
	at: NOW,
};

describe("stats shape", () => {
	it("fills every one of the last 30 days, ending today", () => {
		expect(lastDays(NOW)).toHaveLength(30);
		expect(lastDays(NOW).at(-1)).toBe("2026-10-18");
		expect(STATS.perDay.at(-1)).toEqual({ day: "2026-10-18", messages: 12, people: 1 });
		expect(STATS.perDay[0]).toEqual({ day: "2026-09-19", messages: 0, people: 0 });
	});

	it("labels models and routes without exposing account or gateway names", () => {
		expect(modelLabel("@cf/zai-org/glm-5.3")).toBe("glm-5.3");
		expect(routeLabel("gateway:my-secret-gateway")).toBe("AI Gateway");
		expect(routeLabel("workers-ai")).toBe("Workers AI");
	});

	it("merges and ranks tallies", () => {
		expect(topTallies([{ label: "a", count: 1 }, { label: "b", count: 5 }, { label: "a", count: 2 }])).toEqual([{ label: "b", count: 5 }, { label: "a", count: 3 }]);
	});
});

describe("stats page", () => {
	const html = statsPage(STATS, "https://skin.coey.dev");

	it("shows totals and links the JSON", () => {
		expect(html).toContain("<b>40</b><span>messages</span>");
		expect(html).toContain("versions blocked by the gate");
		expect(html).toContain('href="/stats.json"');
		expect(agoLabel(STATS.lastAt, NOW)).toBe("2 min ago");
	});

	it("updates itself in place instead of a full-page refresh", () => {
		expect(html).not.toContain('http-equiv="refresh"');
		expect(html).toContain("setInterval(swap, 10000)");
		expect(html).toContain('cache: "no-store"');
	});

	it("records only anonymous ids, never emails or content", () => {
		const directory = readFileSync("kernel/auth/directory.ts", "utf8");
		const record = directory.slice(directory.indexOf("record(person"), directory.indexOf("stats(now"));

		expect(record).toContain("INSERT INTO usage (at, person, event, label)");
		expect(directory).not.toMatch(/INSERT INTO usage[^\n]*email/);
		expect(readFileSync("kernel/index.ts", "utf8")).toContain('record(user, "message_sent"');
	});
});

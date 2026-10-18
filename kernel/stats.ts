import { Schema } from "effect";

export const STATS_DAYS = 30;

export const DAY_MS = 86_400_000;

const TOP = 8;

export const UsageEvent = Schema.Literals(["signed_in", "chat_started", "message_sent", "ship_live", "ship_blocked", "rollback", "reset", "tool_call"]);

export type UsageEvent = typeof UsageEvent.Type;

export type Tally = { readonly label: string; readonly count: number };

export type Day = { readonly day: string; readonly messages: number; readonly people: number };

export type InstanceStats = {
	readonly people: number;
	readonly activeToday: number;
	readonly active7d: number;
	readonly chats: number;
	readonly messages: number;
	readonly shipsLive: number;
	readonly shipsBlocked: number;
	readonly rollbacks: number;
	readonly toolCalls: number;
	readonly firstAt: number | null;
	readonly lastAt: number | null;
	readonly perDay: ReadonlyArray<Day>;
	readonly models: ReadonlyArray<Tally>;
	readonly routes: ReadonlyArray<Tally>;
	readonly tools: ReadonlyArray<Tally>;
	readonly at: number;
};

export const dayOf = (at: number): string => new Date(at).toISOString().slice(0, 10);

export const lastDays = (now: number, days = STATS_DAYS): ReadonlyArray<string> => Array.from({ length: days }, (_, index) => dayOf(now - (days - 1 - index) * DAY_MS));

export const modelLabel = (model: string): string => (model === "" ? "default" : (model.split("/").pop() ?? model));

export const routeLabel = (route: string): string => (route.startsWith("gateway:") ? "AI Gateway" : route === "" ? "unknown" : "Workers AI");

export const topTallies = (rows: ReadonlyArray<Tally>): ReadonlyArray<Tally> => {
	const merged = new Map<string, number>();

	for (const row of rows) merged.set(row.label, (merged.get(row.label) ?? 0) + row.count);

	return [...merged].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, TOP);
};

export const fillDays = (now: number, counted: ReadonlyMap<string, { readonly messages: number; readonly people: number }>): ReadonlyArray<Day> =>
	lastDays(now).map((day) => ({ day, messages: counted.get(day)?.messages ?? 0, people: counted.get(day)?.people ?? 0 }));

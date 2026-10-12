import { resolve } from "node:path";
import { Schema } from "effect";
import { expect, test } from "vitest";
import { unstable_startWorker } from "wrangler";

const Outcome = Schema.fromJsonString(
	Schema.Struct({ lives: Schema.Number, files: Schema.Array(Schema.String), commits: Schema.Number, timeline: Schema.Array(Schema.String), kills: Schema.Array(Schema.String) }),
);

const decodeOutcome = Schema.decodeUnknownSync(Outcome);

test("the agent killed three times with ctx.abort() mid-task comes back each time, ships exactly one generation, and finishes, offline in workerd", { timeout: 90_000 }, async () => {
	const worker = await unstable_startWorker({
		config: resolve("test/revival/wrangler.jsonc"),
		dev: { server: { port: 0 }, inspector: false, logLevel: "error", persist: false },
	});

	try {
		const response = await worker.fetch(`http://revival/?name=r-${crypto.randomUUID()}`);
		const outcome = decodeOutcome(await response.text());

		expect(outcome.kills).toEqual(["busy:aborted", "busy:aborted", "busy:aborted"]);
		expect(outcome.lives).toBe(4);
		expect(outcome.timeline).toEqual(["Killed", "Back", "Killed", "Back", "Killed", "Back"]);
		expect(outcome.files).toEqual(["index.html"]);
		expect(outcome.commits).toBe(1);
	} finally {
		await worker.dispose();
	}
});

test("when the body is down, the run still ends and the model is told why, as a tool error", { timeout: 90_000 }, async () => {
	const worker = await unstable_startWorker({
		config: resolve("test/revival/wrangler.jsonc"),
		dev: { server: { port: 0 }, inspector: false, logLevel: "error", persist: false },
	});

	try {
		const outcome = decodeOutcome(await (await worker.fetch("http://revival/rejecting")).text());

		expect(outcome.files).toEqual([]);
		expect(outcome.commits).toBe(0);
		expect(outcome.lives).toBe(1);
		expect(outcome.kills).toContain("error: The body is unavailable: the body is down in this test. Try again.");
	} finally {
		await worker.dispose();
	}
});

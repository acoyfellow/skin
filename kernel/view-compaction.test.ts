import { describe, expect, it } from "vitest";
import { MAX_OUTPUT_TOKENS, cappedOutput } from "./auth/catalog";
import { toBlocks } from "./view";

describe("compaction summaries", () => {
	it("render as a folded thought, never as a message the person typed", () => {
		const summary = "The conversation history before this point was compacted into the following summary:\n\n<summary>\n## Goal\nship it\n</summary>";
		const blocks = toBlocks([{ role: "user", content: summary }, { role: "user", content: "hello" }]);

		expect(blocks.map((block) => block._tag)).toEqual(["Thought", "UserText"]);
		expect(blocks[0]?._tag === "Thought" ? blocks[0].text : "").not.toContain("<summary>");
	});
});

describe("output budget", () => {
	it("never asks a model for its whole context window as output", () => {
		expect(cappedOutput(1_048_576)).toBe(MAX_OUTPUT_TOKENS);
		expect(cappedOutput(8192)).toBe(8192);
	});
});

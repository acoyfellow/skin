import { Option } from "effect";
import { describe, expect, it } from "vitest";
import { CONVERSATION_MIN, DEFAULT_LAYOUT, LIMITS, clampWidth, dragged, fitColumns, readLayout, restored, shortcutEdge, toggled } from "./layout";

describe("side panels", () => {
	it("keep widths inside the allowed range", () => {
		expect(clampWidth("chats", 10)).toBe(LIMITS.chats.min);
		expect(clampWidth("chats", 9999)).toBe(LIMITS.chats.max);
		expect(clampWidth("files", 300.4)).toBe(300);
	});

	it("read a saved layout and fall back on junk", () => {
		expect(readLayout('{"chats":300,"files":500,"chatsHidden":true}')).toEqual({ chats: 300, files: 500, chatsHidden: true, filesHidden: false });
		expect(readLayout("not json")).toEqual(DEFAULT_LAYOUT);
		expect(readLayout(null)).toEqual(DEFAULT_LAYOUT);
	});

	it("always leave the conversation a readable width on desktop", () => {
		for (const viewport of [768, 900, 1100, 1280, 1600, 2400]) {
			const fitted = fitColumns({ ...DEFAULT_LAYOUT, chats: LIMITS.chats.max, files: LIMITS.files.max }, viewport);

			expect(viewport - fitted.chats - fitted.files).toBeGreaterThanOrEqual(CONVERSATION_MIN);
		}
	});

	it("take no width on a phone", () => {
		expect(fitColumns(DEFAULT_LAYOUT, 390)).toEqual({ chats: 0, files: 0 });
	});

	it("hide and come back at the width they had", () => {
		const wide = { ...DEFAULT_LAYOUT, chats: 300 };
		const hidden = toggled(wide, "chats", 1440);

		expect(fitColumns(hidden, 1440).chats).toBe(0);
		expect(fitColumns(toggled(hidden, "chats", 1440), 1440).chats).toBe(300);
	});

	it("follow a drag, stopped by the limits and the conversation minimum", () => {
		expect(dragged(DEFAULT_LAYOUT, "files", 500, 1440).files).toBe(500);
		expect(dragged(DEFAULT_LAYOUT, "files", 5000, 1440).files).toBe(LIMITS.files.max);
		expect(dragged(DEFAULT_LAYOUT, "files", 5000, 1000).files).toBe(1000 - LIMITS.chats.start - CONVERSATION_MIN);
		expect(dragged(DEFAULT_LAYOUT, "chats", 1, 1440).chats).toBe(LIMITS.chats.min);
	});

	it("reset to the default width on a double click", () => {
		expect(restored({ ...DEFAULT_LAYOUT, files: 700 }, "files").files).toBe(LIMITS.files.start);
	});

	it("toggle with Cmd+B for chats and Cmd+J for files", () => {
		expect(shortcutEdge("b")).toEqual(Option.some("chats"));
		expect(shortcutEdge("j")).toEqual(Option.some("files"));
		expect(Option.isNone(shortcutEdge("k"))).toBe(true);
	});
});

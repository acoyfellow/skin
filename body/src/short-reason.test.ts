import { describe, expect, it } from "vitest";
import { shortReason } from "./view/transcript";

describe("failure notes", () => {
	it("show the model's own message instead of the raw JSON dump", () => {
		const raw = String.raw`Run ended: unanswered (model_error: 400: {"name":"AiError","internalCode":8007,"message":"AiError: AiError: {\"object\":\"error\",\"message\":\"Requested token count exceeds the model's maximum context length of 1048576 tokens.\",\"type\":\"BadRequestError\"}"})`;

		expect(shortReason(raw)).toBe("Run ended: unanswered (model_error: 400: Requested token count exceeds the model's maximum context length of 1048576 tokens.");
	});

	it("leave short plain reasons alone", () => {
		expect(shortReason("Sign in with Cloudflare first.")).toBe("Sign in with Cloudflare first.");
	});
});

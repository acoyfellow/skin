import { describe, expect, it } from "vitest";
import { isForBinding } from "./model";

const URL_ = "https://api.cloudflare.com/client/v4/accounts/a/ai/v1/chat/completions";

const streamed = () =>
	new ReadableStream({
		start(controller) {
			controller.enqueue(new TextEncoder().encode('{"model":"m"}'));
			controller.close();
		},
	});

describe("deciding whether the AI binding answers a request", () => {
	it("leaves a streamed body unread when the request is for the user's own account", async () => {
		const init: RequestInit = { method: "POST", headers: { authorization: ["Bearer", "user"].join(" ") }, body: streamed() };

		expect(isForBinding(URL_, init)).toBe(false);
		expect(await new Response(init.body).text()).toBe('{"model":"m"}');
	});

	it("still recognises requests meant for the binding", () => {
		expect(isForBinding(URL_, { headers: { authorization: ["Bearer", "answered-in-process-by-the-ai-binding"].join(" ") } })).toBe(true);
	});
});

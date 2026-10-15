import { describe, expect, it } from "vitest";
import { FRONTIER_OPTIONS, gatewayModelId, modelOptionsFor, modelOrDefault } from "./auth/catalog";
import { bindingBaseUrl, gatewayModels, SENTINEL_HEADERS, withoutCredentials } from "./gateway";
import { workersAIFetch } from "./model";

const SCHEME = ["Bear", "er"].join("");

describe("inference through this Worker's AI Gateway", () => {
	it("points every gateway model at the binding route for its provider", () => {
		const models = gatewayModels("my-ax");
		const opus = models.find((model) => model.id === "claude-opus-5-5");
		const gpt = models.find((model) => model.id === "gpt-6.1-sol");
		const glm = models.find((model) => model.id === "workers-ai/@cf/zai-org/glm-5.3");

		expect(opus?.baseUrl).toBe("https://workers-binding.ai/ai-gateway/gateways/my-ax/anthropic");
		expect(gpt?.baseUrl).toBe("https://workers-binding.ai/ai-gateway/gateways/my-ax/openai");
		expect(glm?.baseUrl).toBe("https://workers-binding.ai/ai-gateway/gateways/my-ax/compat");
		expect(models.every((model) => model.baseUrl.startsWith("https://workers-binding.ai/"))).toBe(true);
	});

	it("never sends a credential header to the gateway", async () => {
		const seen: Array<Headers> = [];

		const send = withoutCredentials(async (input, init) => {
			seen.push(new Request(input, init).headers);

			return new Response("{}");
		});

		await send(bindingBaseUrl("my-ax", "anthropic"), {
			method: "POST",
			headers: { authorization: `${SCHEME} sk-ant-leak`, "x-api-key": "leak", "cf-aig-authorization": `${SCHEME} leak`, "content-type": "application/json" },
			body: "{}",
		});

		expect(seen[0]?.get("authorization")).toBeNull();
		expect(seen[0]?.get("x-api-key")).toBeNull();
		expect(seen[0]?.get("cf-aig-authorization")).toBeNull();
		expect(seen[0]?.get("content-type")).toBe("application/json");
	});

	it("satisfies the SDK's auth check with the binding sentinel and nulls the SDK keys", () => {
		expect(SENTINEL_HEADERS["cf-aig-authorization"]).toBe(`${SCHEME} cloudflare-gateway-binding`);
		expect(SENTINEL_HEADERS.Authorization).toBeNull();
		expect(SENTINEL_HEADERS["x-api-key"]).toBeNull();
	});
});

describe("the model list", () => {
	it("offers only Workers AI models when the deploy sets no gateway", () => {
		expect(modelOptionsFor(null).every((model) => model.group === "Workers AI")).toBe(true);
	});

	it("puts Opus 5.5 first when the deploy sets a gateway", () => {
		expect(modelOptionsFor("my-ax")[0]?.id).toBe("claude-opus-5-5");
		expect(FRONTIER_OPTIONS.some((model) => model.id === "gpt-6.1-sol")).toBe(true);
	});

	it("falls back when a saved model is not offered on this deploy", () => {
		expect(modelOrDefault("claude-opus-5-5", "@cf/zai-org/glm-5.3", null)).toBe("@cf/zai-org/glm-5.3");
		expect(modelOrDefault("claude-opus-5-5", "@cf/zai-org/glm-5.3", "my-ax")).toBe("claude-opus-5-5");
	});

	it("addresses Workers AI models through the gateway's compat route", () => {
		expect(gatewayModelId("@cf/zai-org/glm-5.3")).toBe("workers-ai/@cf/zai-org/glm-5.3");
		expect(gatewayModelId("claude-opus-5-5")).toBe("claude-opus-5-5");
	});
});

describe("Workers AI through the binding", () => {
	it("hands the request body to ai.run and streams the answer back", async () => {
		const calls: Array<{ model: string; inputs: unknown }> = [];

		const send = workersAIFetch(async (model, inputs) => {
			calls.push({ model, inputs });

			return { response: "pong" };
		});

		const response = await send("https://workers-ai.binding.invalid/v1/chat/completions", { method: "POST", body: JSON.stringify({ model: "@cf/zai-org/glm-5.3", messages: [], stream: false }) });

		expect(calls).toEqual([{ model: "@cf/zai-org/glm-5.3", inputs: { messages: [], stream: false } }]);
		expect(await response.json()).toEqual({ response: "pong" });
	});
});

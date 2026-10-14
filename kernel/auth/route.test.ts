import { Result } from "effect";
import { describe, expect, it } from "vitest";
import { baseUrlFor, ROUTE_PLACEHOLDER, type RouteAccess, routedFetch, routeValue, validateChoice } from "./route";

const SCHEME = ["Bear", "er"].join("");

const bearer = (value: string) => `${SCHEME} ${value}`;

const accounts = [
	{ id: "acct-a", name: "Personal" },
	{ id: "acct-b", name: "Work" },
];

const gateways = [
	{ id: "default", authenticated: true },
	{ id: "open", authenticated: false },
];

const models = [
	{ id: "@cf/zai-org/glm-5.3", label: "GLM 5.3" },
	{ id: "@cf/openai/gpt-oss-120b", label: "gpt-oss 120B" },
];

const recordingSend = () => {
	const seen: Array<{ url: string; authorization: string | null; gateway: string | null; body: string }> = [];

	const send: typeof fetch = async (input, init) => {
		const request = new Request(input, init);

		seen.push({ url: request.url, authorization: request.headers.get("authorization"), gateway: request.headers.get("cf-aig-authorization"), body: await request.text() });

		return new Response("{}");
	};

	return { seen, send };
};

describe("choosing a route", () => {
	it("accepts direct Workers AI on an account the user granted", () => {
		const chosen = validateChoice({ accountId: "acct-b", route: "workers-ai", model: "@cf/openai/gpt-oss-120b" }, accounts, gateways, models);

		expect(chosen).toEqual(Result.succeed({ accountId: "acct-b", kind: "workers-ai", gateway: null, model: "@cf/openai/gpt-oss-120b" }));
	});

	it("accepts an AI Gateway that has authentication on", () => {
		const chosen = validateChoice({ accountId: "acct-a", route: "gateway:default", model: "@cf/zai-org/glm-5.3" }, accounts, gateways, models);

		expect(chosen).toEqual(Result.succeed({ accountId: "acct-a", kind: "gateway", gateway: "default", model: "@cf/zai-org/glm-5.3" }));
	});

	it("refuses an AI Gateway with authentication off", () => {
		const chosen = validateChoice({ accountId: "acct-a", route: "gateway:open", model: "@cf/zai-org/glm-5.3" }, accounts, gateways, models);

		expect(Result.isFailure(chosen) && chosen.failure.field).toBe("route");
	});

	it("refuses a gateway that is not on the account", () => {
		const chosen = validateChoice({ accountId: "acct-a", route: "gateway:elsewhere", model: "@cf/zai-org/glm-5.3" }, accounts, gateways, models);

		expect(Result.isFailure(chosen) && chosen.failure.field).toBe("route");
	});

	it("refuses an account the user did not grant", () => {
		const chosen = validateChoice({ accountId: "acct-z", route: "workers-ai", model: "@cf/zai-org/glm-5.3" }, accounts, gateways, models);

		expect(Result.isFailure(chosen) && chosen.failure.field).toBe("account");
	});

	it("refuses a model that is not listed", () => {
		const chosen = validateChoice({ accountId: "acct-a", route: "workers-ai", model: "@cf/made-up/model" }, accounts, gateways, models);

		expect(Result.isFailure(chosen) && chosen.failure.field).toBe("model");
	});

	it("round-trips the saved route into the form value", () => {
		expect(routeValue({ kind: "gateway", gateway: "default" })).toBe("gateway:default");
		expect(routeValue({ kind: "workers-ai", gateway: null })).toBe("workers-ai");
	});
});

describe("sending a model call", () => {
	it("sends direct calls to the account's Workers AI with the user's token", async () => {
		const { seen, send } = recordingSend();
		const access: RouteAccess = { accountId: "acct-a", kind: "workers-ai", gateway: null, model: "m", token: "user-token" };

		await routedFetch(async () => access, send)(`${ROUTE_PLACEHOLDER}/chat/completions`, { method: "POST", headers: { authorization: bearer("placeholder") }, body: "{}" });

		expect(seen[0]).toEqual({ url: "https://api.cloudflare.com/client/v4/accounts/acct-a/ai/v1/chat/completions", authorization: bearer("user-token"), gateway: null, body: "{}" });
	});

	it("sends gateway calls through the chosen AI Gateway with gateway auth", async () => {
		const { seen, send } = recordingSend();
		const access: RouteAccess = { accountId: "acct-a", kind: "gateway", gateway: "default", model: "m", token: "user-token" };

		await routedFetch(async () => access, send)(`${ROUTE_PLACEHOLDER}/chat/completions`, { method: "POST", body: "{}" });

		expect(seen[0]?.url).toBe("https://gateway.ai.cloudflare.com/v1/acct-a/default/workers-ai/v1/chat/completions");
		expect(seen[0]?.gateway).toBe(bearer("user-token"));
	});

	it("uses a changed route on the very next call, with no restart", async () => {
		const { seen, send } = recordingSend();
		let saved: RouteAccess = { accountId: "acct-a", kind: "workers-ai", gateway: null, model: "m", token: "t" };
		const call = routedFetch(async () => saved, send);

		await call(`${ROUTE_PLACEHOLDER}/chat/completions`, { method: "POST", body: "{}" });
		saved = { ...saved, accountId: "acct-b", kind: "gateway", gateway: "default" };
		await call(`${ROUTE_PLACEHOLDER}/chat/completions`, { method: "POST", body: "{}" });

		expect(seen.map((each) => each.url)).toEqual([baseUrlFor({ ...saved, accountId: "acct-a", kind: "workers-ai", gateway: null }) + "/chat/completions", baseUrlFor(saved) + "/chat/completions"]);
	});
});

import { Result } from "effect";
import { describe, expect, it } from "vitest";
import { FRONTIER_OPTIONS, modelOptionsFor, requestModelFor } from "./catalog";
import { placeholderFor, type RouteAccess, routedFetch, routeValue, validateChoice } from "./route";

const SCHEME = ["Bear", "er"].join("");

const bearer = (value: string) => `${SCHEME} ${value}`;

const accounts = [
	{ id: "acct-a", name: "Personal" },
	{ id: "acct-b", name: "Work" },
];

const gateways = [
	{ id: "jordan", authenticated: true },
	{ id: "open", authenticated: false },
];

const OPUS = "claude-opus-5-5";

const GLM = "@cf/zai-org/glm-5.3";

type Seen = { readonly url: string; readonly authorization: string | null; readonly gateway: string | null; readonly model: string };

const recordingSend = () => {
	const seen: Array<Seen> = [];

	const send: typeof fetch = async (input, init) => {
		const request = new Request(input, init);
		const body: { model?: string } = JSON.parse(await request.text());

		seen.push({ url: request.url, authorization: request.headers.get("authorization"), gateway: request.headers.get("cf-aig-authorization"), model: body.model ?? "" });

		return new Response("{}");
	};

	return { seen, send };
};

const access = (overrides: Partial<RouteAccess>): RouteAccess => {
	const base = { accountId: "acct-a", kind: "workers-ai" as const, gateway: null, model: GLM, token: "user-token", ...overrides };

	return { ...base, requestModel: requestModelFor(base.model, base.kind), ...overrides };
};

const post = (call: typeof fetch, family: "anthropic" | "openai" | "compat", path: string) => call(`${placeholderFor(family)}${path}`, { method: "POST", body: JSON.stringify({ model: "placeholder" }) });

describe("the model list", () => {
	it("offers Opus 5.5 and the top GPT models behind an AI Gateway", () => {
		const ids = modelOptionsFor("gateway").map((model) => model.id);

		expect(ids).toContain(OPUS);
		expect(ids).toEqual(expect.arrayContaining(["gpt-6.1-sol", "gpt-6-astra", "gpt-5.5-pro"]));
		expect(FRONTIER_OPTIONS[0]?.id).toBe(OPUS);
	});

	it("offers only Workers AI models on the direct route", () => {
		expect(modelOptionsFor("workers-ai").every((model) => model.group === "Workers AI")).toBe(true);
	});
});

describe("choosing a route", () => {
	it("accepts direct Workers AI on an account the user granted", () => {
		expect(validateChoice({ accountId: "acct-b", route: "workers-ai", model: GLM }, accounts, gateways, modelOptionsFor)).toEqual(
			Result.succeed({ accountId: "acct-b", kind: "workers-ai", gateway: null, model: GLM }),
		);
	});

	it("accepts Opus 5.5 through an AI Gateway that has authentication on", () => {
		expect(validateChoice({ accountId: "acct-a", route: "gateway:jordan", model: OPUS }, accounts, gateways, modelOptionsFor)).toEqual(
			Result.succeed({ accountId: "acct-a", kind: "gateway", gateway: "jordan", model: OPUS }),
		);
	});

	it("refuses Opus on the direct route, with a reason", () => {
		const chosen = validateChoice({ accountId: "acct-a", route: "workers-ai", model: OPUS }, accounts, gateways, modelOptionsFor);

		expect(Result.isFailure(chosen) && chosen.failure.message).toMatch(/AI Gateway/);
	});

	it("refuses an AI Gateway with authentication off", () => {
		const chosen = validateChoice({ accountId: "acct-a", route: "gateway:open", model: GLM }, accounts, gateways, modelOptionsFor);

		expect(Result.isFailure(chosen) && chosen.failure.field).toBe("route");
	});

	it("refuses a gateway that is not on the account", () => {
		const chosen = validateChoice({ accountId: "acct-a", route: "gateway:elsewhere", model: GLM }, accounts, gateways, modelOptionsFor);

		expect(Result.isFailure(chosen) && chosen.failure.field).toBe("route");
	});

	it("refuses an account the user did not grant", () => {
		const chosen = validateChoice({ accountId: "acct-z", route: "workers-ai", model: GLM }, accounts, gateways, modelOptionsFor);

		expect(Result.isFailure(chosen) && chosen.failure.field).toBe("account");
	});

	it("refuses a model that is not listed", () => {
		const chosen = validateChoice({ accountId: "acct-a", route: "gateway:jordan", model: "made-up" }, accounts, gateways, modelOptionsFor);

		expect(Result.isFailure(chosen) && chosen.failure.field).toBe("model");
	});

	it("round-trips the saved route into the form value", () => {
		expect(routeValue({ kind: "gateway", gateway: "jordan" })).toBe("gateway:jordan");
		expect(routeValue({ kind: "workers-ai", gateway: null })).toBe("workers-ai");
	});
});

describe("sending a model call", () => {
	it("sends direct calls to the account's Workers AI with the user's token", async () => {
		const { seen, send } = recordingSend();

		await post(
			routedFetch(async () => access({}), send),
			"compat",
			"/chat/completions",
		);

		expect(seen[0]).toEqual({ url: "https://api.cloudflare.com/client/v4/accounts/acct-a/ai/v1/chat/completions", authorization: bearer("user-token"), gateway: null, model: GLM });
	});

	it("sends Opus through the gateway's Anthropic route with gateway auth", async () => {
		const { seen, send } = recordingSend();

		await post(
			routedFetch(async () => access({ kind: "gateway", gateway: "jordan", model: OPUS }), send),
			"anthropic",
			"/v1/messages",
		);

		expect(seen[0]).toEqual({ url: "https://gateway.ai.cloudflare.com/v1/acct-a/jordan/anthropic/v1/messages", authorization: null, gateway: bearer("user-token"), model: OPUS });
	});

	it("sends GPT through the gateway's OpenAI route", async () => {
		const { seen, send } = recordingSend();

		await post(
			routedFetch(async () => access({ kind: "gateway", gateway: "jordan", model: "gpt-6.1-sol" }), send),
			"openai",
			"/responses",
		);

		expect(seen[0]?.url).toBe("https://gateway.ai.cloudflare.com/v1/acct-a/jordan/openai/responses");
		expect(seen[0]?.model).toBe("gpt-6.1-sol");
	});

	it("prefixes Workers AI models when they go through a gateway", async () => {
		const { seen, send } = recordingSend();

		await post(
			routedFetch(async () => access({ kind: "gateway", gateway: "jordan", model: GLM }), send),
			"compat",
			"/chat/completions",
		);

		expect(seen[0]).toMatchObject({ url: "https://gateway.ai.cloudflare.com/v1/acct-a/jordan/compat/chat/completions", model: `workers-ai/${GLM}` });
	});

	it("uses a changed route on the very next call, with no restart", async () => {
		const { seen, send } = recordingSend();
		let saved = access({});
		const call = routedFetch(async () => saved, send);

		await post(call, "compat", "/chat/completions");
		saved = access({ accountId: "acct-b", kind: "gateway", gateway: "jordan", model: GLM });
		await post(call, "compat", "/chat/completions");

		expect(seen.map((each) => each.url)).toEqual(["https://api.cloudflare.com/client/v4/accounts/acct-a/ai/v1/chat/completions", "https://gateway.ai.cloudflare.com/v1/acct-b/jordan/compat/chat/completions"]);
	});
});

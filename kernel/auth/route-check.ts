import { familyOfModel, modelOrDefault, requestModelFor } from "./catalog";
import { type CloudflareAuthEnv, freshToken } from "./cloudflare";
import { baseUrlFor, routedHeaders } from "./route";

type RouteCheckEnv = CloudflareAuthEnv & { readonly MODEL: string };

export type RouteCheck = { readonly route: string; readonly model: string; readonly status: number; readonly ok: boolean; readonly problem: string | null };

const pathFor = (family: string) => (family === "anthropic" ? "/v1/messages" : family === "openai" ? "/responses" : "/chat/completions");

const PROMPT = "Reply with exactly: pong";

const bodyFor = (family: string, model: string) =>
	family === "anthropic"
		? { model, max_tokens: 16, messages: [{ role: "user", content: PROMPT }] }
		: family === "openai"
			? { model, input: PROMPT, max_output_tokens: 16 }
			: { model, messages: [{ role: "user", content: PROMPT }], max_tokens: 16 };

const BILLING = /unified billing credits/i;

const problemOf = (status: number, body: string): string | null => {
	if (status >= 200 && status < 300) return null;

	if (BILLING.test(body)) return "This AI Gateway has no unified billing credits. Add credits in the AI Gateway dashboard, or pick Workers AI.";

	return `The model route answered ${status}.`;
};

export const checkRoute = async (env: RouteCheckEnv, owner: string): Promise<RouteCheck> => {
	const { grant, token } = await freshToken(env, owner);
	const model = modelOrDefault(grant.model, env.MODEL);
	const family = familyOfModel(model);
	const route = { accountId: grant.accountId, kind: grant.routeKind, gateway: grant.gateway, model };
	const requestModel = requestModelFor(model, grant.routeKind);
	const headers = routedHeaders(new Headers({ "content-type": "application/json", "anthropic-version": "2023-06-01" }), { ...route, token, requestModel });
	const response = await fetch(`${baseUrlFor(route, family)}${pathFor(family)}`, { method: "POST", headers, body: JSON.stringify(bodyFor(family, requestModel)) });
	const body = await response.text();

	return { route: grant.routeKind === "gateway" ? `gateway:${grant.gateway ?? ""}` : "workers-ai", model, status: response.status, ok: response.ok, problem: problemOf(response.status, body) };
};

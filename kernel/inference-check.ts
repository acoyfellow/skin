import { modelOrDefault } from "./auth/catalog";
import { directoryOf, type CloudflareAuthEnv, inferenceOf } from "./auth/cloudflare";
import { familyOfModel, gatewayModelId } from "./auth/catalog";
import { type AiWithFetch, bindingBaseUrl, bindingFetch, SENTINEL_HEADERS } from "./gateway";

type InferenceEnv = CloudflareAuthEnv & { readonly AI: AiWithFetch; readonly MODEL: string; readonly SKIN_AI_GATEWAY?: string };

export type InferenceCheck = { readonly route: string; readonly model: string; readonly ok: boolean; readonly status: number; readonly reply: string; readonly problem: string | null };

const PROMPT = "Reply with exactly: pong";

const MAX_TOKENS = 64;

const PATHS = { anthropic: "/v1/messages", openai: "/responses", compat: "/chat/completions" } as const;

const bodyFor = (family: keyof typeof PATHS, model: string) =>
	family === "anthropic"
		? { model, max_tokens: MAX_TOKENS, messages: [{ role: "user", content: PROMPT }] }
		: family === "openai"
			? { model, input: PROMPT, max_output_tokens: MAX_TOKENS }
			: { model, messages: [{ role: "user", content: PROMPT }], max_tokens: MAX_TOKENS };

const problemOf = (status: number, body: string): string | null =>
	status >= 200 && status < 300 ? null : /unified billing credits/i.test(body) ? "The AI Gateway has no unified billing credits." : `The model answered ${status}: ${body.slice(0, 200)}`;

const throughGateway = async (env: InferenceEnv, gateway: string, model: string): Promise<InferenceCheck> => {
	const family = familyOfModel(model);
	const headers = new Headers({ "content-type": "application/json", "anthropic-version": "2023-06-01" });

	for (const [name, value] of Object.entries(SENTINEL_HEADERS)) if (value !== null) headers.set(name, value);

	const response = await bindingFetch(env.AI)(`${bindingBaseUrl(gateway, family)}${PATHS[family]}`, { method: "POST", headers, body: JSON.stringify(bodyFor(family, gatewayModelId(model))) });
	const body = await response.text();

	return { route: `gateway:${gateway}`, model, ok: response.ok, status: response.status, reply: response.ok ? body.slice(0, 300) : "", problem: problemOf(response.status, body) };
};

const throughWorkersAI = async (env: InferenceEnv, model: string): Promise<InferenceCheck> => {
	const result = await env.AI.run(model, { messages: [{ role: "user", content: PROMPT }], max_tokens: MAX_TOKENS }).then(
		(output) => ({ ok: true, body: JSON.stringify(output) }),
		(cause: unknown) => ({ ok: false, body: String(cause) }),
	);

	return { route: "workers-ai", model, ok: result.ok, status: result.ok ? 200 : 502, reply: result.ok ? result.body.slice(0, 300) : "", problem: result.ok ? null : result.body.slice(0, 200) };
};

export const checkInference = async (env: InferenceEnv, owner: string): Promise<InferenceCheck> => {
	const inference = inferenceOf(env);
	const grant = await directoryOf(env).grantFor(owner);
	const model = modelOrDefault(grant?.model ?? null, inference.fallbackModel, inference.gateway);

	return inference.gateway === null ? throughWorkersAI(env, model) : throughGateway(env, inference.gateway, model);
};

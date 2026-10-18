import type { Provider, ProviderStreams } from "@earendil-works/pi-ai";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import { createProvider } from "@earendil-works/pi-ai/models";
import { CLOUDFLARE_AI_GATEWAY_MODELS } from "@earendil-works/pi-ai/providers/cloudflare-ai-gateway.models";
import { CLOUDFLARE_WORKERS_AI_MODELS } from "@earendil-works/pi-ai/providers/cloudflare-workers-ai.models";
import { type ModelFamily, type ModelOption, placeholderFor, type RouteAccess, type RouteKind, routedFetch } from "./route";

const WORKERS_AI_PREFIX = "workers-ai/";

export const FRONTIER_IDS = [
	"claude-opus-5-5",
	"claude-fable-5-1",
	"claude-sonnet-5-5",
	"claude-opus-5",
	"claude-fable-5",
	"claude-sonnet-5",
	"claude-haiku-4-5",
	"gpt-6.1-sol",
	"gpt-6-astra",
	"gpt-6-sol",
	"gpt-6-luna",
	"gpt-5.6-sol",
	"gpt-5.6-terra",
	"gpt-5.6-luna",
	"gpt-5.5-pro",
	"gpt-5.5",
	"o3",
];

const familyOfApi = (api: string): ModelFamily => (api === "anthropic-messages" ? "anthropic" : api === "openai-responses" ? "openai" : "compat");

const gatewayCatalog = Object.values(CLOUDFLARE_AI_GATEWAY_MODELS);

const frontier = FRONTIER_IDS.flatMap((id) => gatewayCatalog.filter((model) => model.id === id));

const workersAI = Object.values(CLOUDFLARE_WORKERS_AI_MODELS);

const labelOf = (name: string) => name.replace(/^Glm /, "GLM ").replace(/^Gpt /, "GPT ");

export const WORKERS_AI_OPTIONS: ReadonlyArray<ModelOption> = workersAI.map((model) => ({ id: model.id, label: labelOf(model.name), family: "compat", group: "Workers AI" }));

export const FRONTIER_OPTIONS: ReadonlyArray<ModelOption> = frontier.map((model) => ({
	id: model.id,
	label: labelOf(model.name),
	family: familyOfApi(model.api),
	group: model.api === "anthropic-messages" ? "Anthropic" : "OpenAI",
}));

export const modelOptionsFor = (kind: RouteKind): ReadonlyArray<ModelOption> => (kind === "gateway" ? [...FRONTIER_OPTIONS, ...WORKERS_AI_OPTIONS] : WORKERS_AI_OPTIONS);

const ALL_MODEL_OPTIONS = modelOptionsFor("gateway");

export const modelOrDefault = (chosen: string | null, fallback: string): string => (chosen !== null && ALL_MODEL_OPTIONS.some((model) => model.id === chosen) ? chosen : fallback);

export const familyOfModel = (id: string): ModelFamily => ALL_MODEL_OPTIONS.find((model) => model.id === id)?.family ?? "compat";

export const requestModelFor = (id: string, kind: RouteKind): string => (kind === "gateway" && familyOfModel(id) === "compat" ? `${WORKERS_AI_PREFIX}${id}` : id);

export const ACCOUNT_PROVIDER = "skin-account";

const withFetch = (streams: ProviderStreams, send: typeof fetch): ProviderStreams => ({
	stream: (model, context, options) => streams.stream(model, context, { ...options, fetch: send }),
	streamSimple: (model, context, options) => streams.streamSimple(model, context, { ...options, fetch: send }),
});

export const MAX_OUTPUT_TOKENS = 32_000;

export const cappedOutput = (maxTokens: number): number => Math.min(maxTokens, MAX_OUTPUT_TOKENS);

const accountModels = [
	...workersAI.map((model) => ({ ...model, maxTokens: cappedOutput(model.maxTokens), provider: ACCOUNT_PROVIDER, baseUrl: placeholderFor("compat") })),
	...frontier.map((model) => ({ ...model, maxTokens: cappedOutput(model.maxTokens), provider: ACCOUNT_PROVIDER, baseUrl: placeholderFor(familyOfApi(model.api)) })),
];

export const routedAccountProvider = (access: () => Promise<RouteAccess>, send: typeof fetch = (input, init) => globalThis.fetch(input, init)): Provider => {
	const routed = routedFetch(access, send);

	return createProvider({
		id: ACCOUNT_PROVIDER,
		name: "Your Cloudflare account",
		auth: { apiKey: { name: "signed-in Cloudflare account", resolve: async () => ({ auth: { apiKey: "set-per-request" } }) } },
		models: accountModels,
		api: {
			"openai-completions": withFetch(openAICompletionsApi(), routed),
			"openai-responses": withFetch(openAIResponsesApi(), routed),
			"anthropic-messages": withFetch(anthropicMessagesApi(), routed),
		},
	});
};

import type { Provider, ProviderStreams } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { createProvider } from "@earendil-works/pi-ai/models";
import { CLOUDFLARE_WORKERS_AI_MODELS } from "@earendil-works/pi-ai/providers/cloudflare-workers-ai.models";
import { type ModelOption, ROUTE_PLACEHOLDER, type RouteAccess, routedFetch } from "./route";

const CHAT_MODELS = Object.values(CLOUDFLARE_WORKERS_AI_MODELS);

export const MODEL_OPTIONS: ReadonlyArray<ModelOption> = CHAT_MODELS.map((model) => ({ id: model.id, label: model.name }));

export const modelOrDefault = (chosen: string | null, fallback: string): string => (chosen !== null && MODEL_OPTIONS.some((model) => model.id === chosen) ? chosen : fallback);

const withFetch = (streams: ProviderStreams, send: typeof fetch): ProviderStreams => ({
	stream: (model, context, options) => streams.stream(model, context, { ...options, fetch: send }),
	streamSimple: (model, context, options) => streams.streamSimple(model, context, { ...options, fetch: send }),
});

export const routedWorkersAI = (access: () => Promise<RouteAccess>, send: typeof fetch = (input, init) => globalThis.fetch(input, init)): Provider =>
	createProvider({
		id: "cloudflare-workers-ai",
		name: "Cloudflare Workers AI (your account)",
		auth: { apiKey: { name: "signed-in Cloudflare account", resolve: async () => ({ auth: { apiKey: "set-per-request" } }) } },
		models: CHAT_MODELS.map((model) => ({ ...model, baseUrl: ROUTE_PLACEHOLDER })),
		api: withFetch(openAICompletionsApi(), routedFetch(access, send)),
	});

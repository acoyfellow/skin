import type { Provider, ProviderStreams } from "@earendil-works/pi-ai";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import { createProvider } from "@earendil-works/pi-ai/models";
import { CLOUDFLARE_AI_GATEWAY_MODELS } from "@earendil-works/pi-ai/providers/cloudflare-ai-gateway.models";
import { CLOUDFLARE_GATEWAY_BINDING_AUTH_SENTINEL, createAiBindingFetch } from "@earendil-works/pi-ai/api/cloudflare-ai-binding";

export type GatewayFamily = "anthropic" | "openai" | "compat";

export const familyOfApi = (api: string): GatewayFamily => (api === "anthropic-messages" ? "anthropic" : api === "openai-responses" ? "openai" : "compat");

export const bindingBaseUrl = (gateway: string, family: GatewayFamily): string => `https://workers-binding.ai/ai-gateway/gateways/${encodeURIComponent(gateway)}/${family}`;

const STRIPPED = ["cf-aig-authorization", "authorization", "x-api-key"];

export const withoutCredentials =
	(send: typeof fetch): typeof fetch =>
	async (input, init) => {
		const request = new Request(input, init);
		const headers = new Headers(request.headers);

		for (const name of STRIPPED) headers.delete(name);

		const hasBody = request.method !== "GET" && request.method !== "HEAD";

		return send(new Request(request.url, { method: request.method, headers, body: hasBody ? await request.text() : null, signal: request.signal }));
	};

export const SENTINEL_HEADERS = {
	"cf-aig-authorization": ["Bearer", CLOUDFLARE_GATEWAY_BINDING_AUTH_SENTINEL].join(" "),
	Authorization: null,
	"x-api-key": null,
};

export type AiWithFetch = Ai & { fetch?: (input: Request | string | URL, init?: RequestInit) => Promise<Response> };

export const bindingFetch = (ai: AiWithFetch): typeof fetch => withoutCredentials(createAiBindingFetch(ai));

const withFetch = (streams: ProviderStreams, send: typeof fetch): ProviderStreams => ({
	stream: (model, context, options) => streams.stream(model, context, { ...options, fetch: send }),
	streamSimple: (model, context, options) => streams.streamSimple(model, context, { ...options, fetch: send }),
});

export const GATEWAY_PROVIDER = "skin-gateway";

export const gatewayModels = (gateway: string) =>
	Object.values(CLOUDFLARE_AI_GATEWAY_MODELS).map((model) => ({ ...model, provider: GATEWAY_PROVIDER, baseUrl: bindingBaseUrl(gateway, familyOfApi(model.api)) }));

export const gatewayProvider = (gateway: string, send: typeof fetch): Provider =>
	createProvider({
		id: GATEWAY_PROVIDER,
		name: `AI Gateway ${gateway}`,
		auth: { apiKey: { name: "this Worker's AI Gateway", resolve: async () => ({ auth: { headers: SENTINEL_HEADERS } }) } },
		models: gatewayModels(gateway),
		api: {
			"openai-completions": withFetch(openAICompletionsApi(), send),
			"openai-responses": withFetch(openAIResponsesApi(), send),
			"anthropic-messages": withFetch(anthropicMessagesApi(), send),
		},
	});

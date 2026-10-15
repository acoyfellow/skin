import type { Provider, ProviderStreams } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { createProvider } from "@earendil-works/pi-ai/models";
import { CLOUDFLARE_WORKERS_AI_MODELS } from "@earendil-works/pi-ai/providers/cloudflare-workers-ai.models";

export const SIGNED_OUT_PROVIDER = "skin-signed-out";

export const SIGN_IN_FIRST = "Sign in with Cloudflare first. skin only runs models on the signed-in person's own account.";

const refuse: typeof fetch = async () => Response.json({ error: { message: SIGN_IN_FIRST } }, { status: 401 });

const withFetch = (streams: ProviderStreams, send: typeof fetch): ProviderStreams => ({
	stream: (model, context, options) => streams.stream(model, context, { ...options, fetch: send }),
	streamSimple: (model, context, options) => streams.streamSimple(model, context, { ...options, fetch: send }),
});

export const signedOutProvider = (): Provider =>
	createProvider({
		id: SIGNED_OUT_PROVIDER,
		name: "Nobody signed in",
		auth: { apiKey: { name: "no account", resolve: async () => ({ auth: { apiKey: "none" } }) } },
		models: Object.values(CLOUDFLARE_WORKERS_AI_MODELS).map((model) => ({ ...model, provider: SIGNED_OUT_PROVIDER, baseUrl: "https://signed-out.skin.invalid/v1" })),
		api: { "openai-completions": withFetch(openAICompletionsApi(), refuse) },
	});

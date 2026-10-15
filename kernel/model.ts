import type { Provider, ProviderStreams } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { createProvider } from "@earendil-works/pi-ai/models";
import { CLOUDFLARE_WORKERS_AI_MODELS } from "@earendil-works/pi-ai/providers/cloudflare-workers-ai.models";
import { Effect, Schema } from "effect";

const ChatRequest = Schema.StructWithRest(Schema.Struct({ model: Schema.String }), [Schema.Record(Schema.String, Schema.Json)]);

const decodeChatRequest = Schema.decodeUnknownEffect(Schema.fromJsonString(ChatRequest));

class BindingFailed extends Schema.TaggedError<BindingFailed>()("BindingFailed", { cause: Schema.Defect() }) {}

export type AiRun = (model: string, inputs: Readonly<Record<string, Schema.Json>>) => Promise<ReadableStream | AiModels[keyof AiModels]["postProcessedOutputs"]>;

const answer = (run: AiRun, request: Request) =>
	Effect.tryPromise({ try: () => request.text(), catch: (cause) => new BindingFailed({ cause }) }).pipe(
		Effect.flatMap(decodeChatRequest),
		Effect.flatMap(({ model, ...inputs }) => Effect.tryPromise({ try: () => run(model, inputs), catch: (cause) => new BindingFailed({ cause }) })),
		Effect.map((result) =>
			result instanceof ReadableStream ? new Response(result, { headers: { "content-type": "text/event-stream" } }) : Response.json(result),
		),
		Effect.catch((error) => Effect.succeed(Response.json({ error: { message: String(error) } }, { status: 502 }))),
	);

export const workersAIFetch =
	(run: AiRun): typeof fetch =>
	(input, init) =>
		Effect.runPromise(answer(run, new Request(input, init)));

const WORKERS_AI_PROVIDER = "skin-workers-ai";

const BINDING_ORIGIN = "https://workers-ai.binding.invalid/v1";

const models = Object.values(CLOUDFLARE_WORKERS_AI_MODELS).map((model) => ({ ...model, provider: WORKERS_AI_PROVIDER, baseUrl: BINDING_ORIGIN }));

const withFetch = (streams: ProviderStreams, send: typeof fetch): ProviderStreams => ({
	stream: (model, context, options) => streams.stream(model, context, { ...options, fetch: send }),
	streamSimple: (model, context, options) => streams.streamSimple(model, context, { ...options, fetch: send }),
});

export const workersAIProvider = (ai: Ai): Provider =>
	createProvider({
		id: WORKERS_AI_PROVIDER,
		name: "Workers AI",
		auth: { apiKey: { name: "this Worker's AI binding", resolve: async () => ({ auth: { apiKey: "ai-binding" } }) } },
		models,
		api: { "openai-completions": withFetch(openAICompletionsApi(), workersAIFetch((model, inputs) => ai.run(model, inputs))) },
	});

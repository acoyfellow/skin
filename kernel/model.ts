import { Effect, Option, Schema } from "effect";

const ANSWERED_BY_BINDING = "answered-in-process-by-the-ai-binding";

const CREDENTIAL_NAMES = new Set(["CLOUDFLARE_API_KEY", "CLOUDFLARE_ACCOUNT_ID"]);

const CHAT_COMPLETIONS = /^https:\/\/api\.cloudflare\.com\/.*\/ai\/v1\/chat\/completions$/;

export const bindingAuthContext = {
	env: async (name: string): Promise<string | undefined> => (CREDENTIAL_NAMES.has(name) ? ANSWERED_BY_BINDING : undefined),
	fileExists: async (): Promise<boolean> => false,
};

const ChatRequest = Schema.StructWithRest(Schema.Struct({ model: Schema.String }), [Schema.Record(Schema.String, Schema.Json)]);

const decodeChatRequest = Schema.decodeUnknownEffect(Schema.fromJsonString(ChatRequest));

class BindingFailed extends Schema.TaggedError<BindingFailed>()("BindingFailed", { cause: Schema.Defect() }) {}

type AiRun = (model: string, inputs: Readonly<Record<string, Schema.Json>>) => Promise<ReadableStream | AiModels[keyof AiModels]["postProcessedOutputs"]>;

const answer = (run: AiRun, request: Request) =>
	Effect.tryPromise({ try: () => request.text(), catch: (cause) => new BindingFailed({ cause }) }).pipe(
		Effect.flatMap(decodeChatRequest),
		Effect.flatMap(({ model, ...inputs }) => Effect.tryPromise({ try: () => run(model, inputs), catch: (cause) => new BindingFailed({ cause }) })),
		Effect.map((result) =>
			result instanceof ReadableStream ? new Response(result, { headers: { "content-type": "text/event-stream" } }) : Response.json(result),
		),
		Effect.catch((error) => Effect.succeed(Response.json({ error: { message: String(error) } }, { status: 502 }))),
	);

const urlOf = (input: RequestInfo | URL): string => (input instanceof Request ? input.url : String(input));

const BINDING_BEARER = `Bearer ${ANSWERED_BY_BINDING}`;

const authorizationOf = (input: RequestInfo | URL, init: RequestInit | undefined): string | null =>
	init?.headers === undefined ? (input instanceof Request ? input.headers.get("authorization") : null) : new Headers(init.headers).get("authorization");

export const isForBinding = (input: RequestInfo | URL, init: RequestInit | undefined): boolean => CHAT_COMPLETIONS.test(urlOf(input)) && authorizationOf(input, init) === BINDING_BEARER;


let bridge: Option.Option<{ run: AiRun }> = Option.none();

export const routeWorkersAIThroughBinding = (ai: Ai): void => {
	const run: AiRun = (model, inputs) => ai.run(model, inputs);

	if (Option.isSome(bridge)) {
		bridge.value.run = run;

		return;
	}

	const current = { run };
	const original = globalThis.fetch.bind(globalThis);

	bridge = Option.some(current);
	globalThis.fetch = (input, init) =>
		isForBinding(input, init) ? Effect.runPromise(answer(current.run, new Request(input, init))) : original(input, init);
};

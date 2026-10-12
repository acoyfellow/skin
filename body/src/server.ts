import { Effect, Schema } from "effect";
import { runChecks } from "./check";
import "./checks";

type Store = {
	readonly get: (key: string) => Promise<string | null>;
	readonly put: (key: string, value: string) => Promise<void>;
	readonly delete: (key: string) => Promise<void>;
	readonly list: (prefix: string) => Promise<ReadonlyArray<string>>;
};

type Env = { readonly STORE: Store; readonly GENERATION: string };

const Note = Schema.Struct({ text: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2000)) });

const decodeNote = Schema.decodeUnknownEffect(Schema.fromJsonString(Note));

class StoreFailed extends Schema.TaggedError<StoreFailed>()("StoreFailed", { reason: Schema.String }) {}

const store = <A>(run: () => Promise<A>) => Effect.tryPromise({ try: run, catch: (cause) => new StoreFailed({ reason: String(cause) }) });

const json = <A>(value: A, status = 200) => Response.json(value, { status });

const notes = (env: Env) =>
	store(() => env.STORE.list("note:")).pipe(
		Effect.flatMap((keys) => Effect.forEach(keys, (key) => store(() => env.STORE.get(key)), { concurrency: 8 })),
		Effect.map((values) => values.filter((value): value is string => value !== null)),
	);

const addNote = (request: Request, env: Env) =>
	Effect.promise(() => request.text()).pipe(
		Effect.flatMap(decodeNote),
		Effect.flatMap(({ text }) => store(() => env.STORE.put(`note:${Date.now().toString().padStart(15, "0")}`, text))),
		Effect.as(json({ ok: true }, 201)),
		Effect.catchTag("SchemaError", (error) => Effect.succeed(json({ error: error.message }, 400))),
	);

const route = (request: Request, env: Env): Effect.Effect<Response, StoreFailed> => {
	const { pathname } = new URL(request.url);

	if (pathname === "/_body/health") return Effect.succeed(json({ ok: true, generation: Number(env.GENERATION) }));

	if (pathname === "/_body/checks") return Effect.sync(() => json({ checks: runChecks() }));

	if (pathname === "/api/notes" && request.method === "GET") return Effect.map(notes(env), (all) => json({ notes: all }));

	if (pathname === "/api/notes" && request.method === "POST") return addNote(request, env);

	return Effect.succeed(json({ error: `no route for ${request.method} ${pathname}` }, 404));
};

export default {
	fetch: (request: Request, env: Env): Promise<Response> =>
		Effect.runPromise(route(request, env).pipe(Effect.catchTag("StoreFailed", ({ reason }) => Effect.succeed(json({ error: reason }, 503))))),
};

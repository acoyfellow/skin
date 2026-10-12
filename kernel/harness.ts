import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { Type } from "@earendil-works/pi-ai";
import { type CreateModelsOptions, createModels, type Provider } from "@earendil-works/pi-ai/models";
import { cloudflareWorkersAIProvider } from "@earendil-works/pi-ai/providers/cloudflare-workers-ai";
import { type Conversation, createRegistry, defineExtension, defineTool, Harness, LiveDoc, section } from "@earendil-works/pi-durable";
import { Context, Effect, Layer, Option, Queue, Schema, Stream } from "effect";
import { type Block, BodyFrame, type ShipReport } from "../shared/protocol";
import { type BodyUnavailable, Repo, type RepoFiles } from "./files";
import { bindingAuthContext } from "./model";
import { Broadcast } from "./services";
import { openDurableObjectSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/cloudflare";
import { decodePiLiveState, decodePiMessages, type PiLiveState, toBlocks } from "./view";

const CONTEXT = BACKGROUND_CONTEXT;

const HISTORY_LIMIT = 500;

const PROMPT = [
	"You are planarian: an app that rewrites its own code while the owner uses it.",
	"Your body is the app itself: its Foldkit client, its server, its styles, and its checks, including the chat you are speaking through.",
	"Start by reading AGENTS.md with read_file. It explains the layout and the rules.",
	"write_file and delete_file change the draft only. ship builds the draft, runs the gate, and makes it live only if every check passes. If ship rejects it, read the errors, fix the files, and ship again.",
	"rollback makes an earlier generation live again.",
	"Do the work instead of describing it. When finished, reply in one or two short sentences that say which generation is live.",
].join("\n");

export class HarnessFailed extends Schema.TaggedError<HarnessFailed>()("HarnessFailed", { step: Schema.String, reason: Schema.String }) {}

export class RunEnded extends Schema.TaggedError<RunEnded>()("RunEnded", { status: Schema.String }) {}

const pi = <A>(step: string, run: () => Promise<A>) => Effect.tryPromise({ try: run, catch: (cause) => new HarnessFailed({ step, reason: String(cause) }) });

const text = (value: string) => ({ content: [{ type: "text" as const, text: value }] });

type BodyChanged = (repo: RepoFiles) => Effect.Effect<void>;

type ToolFailure = BodyUnavailable;

const explain = (failure: ToolFailure): string => `The body is unavailable: ${failure.reason}. Try again.`;

const describeReport = (report: ShipReport): string =>
	[
		`Generation ${report.generation}: ${report.status}. ${report.reason}`,
		...report.checks.map((check) => `- ${check.ok ? "pass" : "FAIL"} ${check.name} (${check.ms} ms)${check.ok ? "" : `\n${check.detail}`}`),
	].join("\n");

const tools = (repo: RepoFiles, bodyChanged: BodyChanged, context: Context.Context<never>) => {
	const run = <A>(effect: Effect.Effect<A, ToolFailure>) => Effect.runPromiseWith(context)(effect.pipe(Effect.catch((failure) => Effect.fail(new Error(explain(failure))))));

	return [
		defineTool({
			name: "list_files",
			description: "List every file in the draft of your body.",
			parameters: Type.Object({}),
			replay: "safe",
			execute: () => run(repo.list.pipe(Effect.map((files) => text(files.length > 0 ? files.join("\n") : "(empty draft)")))),
		}),
		defineTool({
			name: "read_file",
			description: "Read a file from the draft of your body.",
			parameters: Type.Object({ path: Type.String() }),
			replay: "safe",
			execute: (args) => run(repo.read(args.path).pipe(Effect.map(Option.match({ onSome: text, onNone: () => text(`No such file: ${args.path}`) })))),
		}),
		defineTool({
			name: "write_file",
			description: "Create or replace a whole file in the draft. Nothing goes live until you ship.",
			parameters: Type.Object({ path: Type.String(), content: Type.String() }),
			replay: "safe",
			executionMode: "sequential",
			execute: (args) => run(repo.write(args.path, args.content).pipe(Effect.tap(() => bodyChanged(repo)), Effect.map(text))),
		}),
		defineTool({
			name: "delete_file",
			description: "Delete a file from the draft. Nothing goes live until you ship.",
			parameters: Type.Object({ path: Type.String() }),
			replay: "safe",
			executionMode: "sequential",
			execute: (args) => run(repo.remove(args.path).pipe(Effect.tap(() => bodyChanged(repo)), Effect.map(text))),
		}),
		defineTool({
			name: "ship",
			description: "Build the draft into a new generation, run the gate, and make it live only if every check passes. Returns each check, with errors for any that failed.",
			parameters: Type.Object({ message: Type.String({ description: "What this generation changes, in one line" }) }),
			replay: "safe",
			executionMode: "sequential",
			execute: (args) => run(repo.ship(args.message).pipe(Effect.tap(() => bodyChanged(repo)), Effect.map((report) => text(describeReport(report))))),
		}),
		defineTool({
			name: "rollback",
			description: "Make an earlier generation that passed the gate live again. The draft is reset to match it.",
			parameters: Type.Object({ generation: Type.Number() }),
			replay: "safe",
			executionMode: "sequential",
			execute: (args) => run(repo.rollback(args.generation).pipe(Effect.tap(() => bodyChanged(repo)), Effect.map(text))),
		}),
	];
};

type Agentic = {
	readonly repo: RepoFiles;
	readonly live: Stream.Stream<Option.Option<PiLiveState>>;
	readonly blocks: Effect.Effect<ReadonlyArray<Block>, HarnessFailed>;
	readonly run: (requestId: string, input: string) => Effect.Effect<void, HarnessFailed | RunEnded>;
	readonly bodyChanged: BodyChanged;
};

type ModelChoice = { readonly provider: Provider; readonly modelId: string; readonly options: CreateModelsOptions };

export class Model extends Context.Service<Model, ModelChoice>()("planarian/Model") {
	static readonly workersAI = (modelId: string) => Layer.succeed(Model, { provider: cloudflareWorkersAIProvider(), modelId, options: { authContext: bindingAuthContext } });
}

export class Pi extends Context.Service<Pi, Agentic>()("planarian/Pi") {
	static readonly layer = (storage: DurableObjectStorage) =>
		Layer.effect(
			Pi,
			Effect.gen(function* () {
				const repo = yield* Repo;
				const broadcast = yield* Broadcast;

				const bodyChanged: BodyChanged = (changed) =>
					changed.state.pipe(
						Effect.flatMap((body) => broadcast.send(BodyFrame.make({ body }))),
						Effect.ignore,
					);

				const choice = yield* Model;
				const models = createModels(choice.options);

				models.setProvider(choice.provider);

				const registry = createRegistry();

				registry.install(defineExtension({ name: "planarian", sections: [section("preamble", () => PROMPT, { tag: false })], tools: tools(repo, bodyChanged, yield* Effect.context<never>()) }));

				const harness = yield* Effect.acquireRelease(
					pi("open", async () => Harness.open(await openDurableObjectSqliteStorage(storage), { models, registry }, CONTEXT)),
					(opened) => Effect.promise(() => opened.close(CONTEXT).catch(() => undefined)),
				);

				const conversation: Conversation = yield* pi("root", () =>
					harness.root(CONTEXT, { agent: { model: { provider: choice.provider.id, modelId: choice.modelId } } }),
				);

				const watch = yield* pi("watch", () => harness.watchDoc(LiveDoc, conversation.id, CONTEXT)).pipe(
					Effect.flatMap((handle) => (handle === undefined ? Effect.fail(new HarnessFailed({ step: "watch", reason: "no live document" })) : Effect.succeed(handle))),
				);

				const live = Stream.callback<Option.Option<PiLiveState>>((queue) =>
					Effect.acquireRelease(
						Effect.sync(() =>
							watch.start(async (value) => {
								Queue.offerUnsafe(queue, decodePiLiveState(value));
							}),
						),
						() => Effect.promise(() => watch.stop()),
					),
				);

				const blocks = pi("entries", () => conversation.entries({}, HISTORY_LIMIT, undefined, CONTEXT)).pipe(
					Effect.map((page) => [...page.items].reverse().flatMap((entry) => entry.model ?? [])),
					Effect.map((messages) => toBlocks(Option.getOrElse(decodePiMessages(messages), () => []))),
				);

				const run = (requestId: string, input: string) =>
					pi("submit", () => conversation.submit({ type: "input", content: input, requestId }, CONTEXT)).pipe(
						Effect.flatMap((submission) => pi("wait", () => submission.wait(CONTEXT))),
						Effect.flatMap((settled) => (settled.status === "done" ? Effect.void : Effect.fail(new RunEnded({ status: settled.status })))),
					);

				harness.resume();

				return { repo, live, blocks, run, bodyChanged };
			}),
		);
}

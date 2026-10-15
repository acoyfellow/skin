import { DurableObject } from "cloudflare:workers";
import { Cause, Effect, Exit, Layer, ManagedRuntime, Option, Schema } from "effect";
import { type ConversationName, KillOutcomeJson, ReadOutcomeJson, StopOutcomeJson, SendOutcomeJson, ServerFrameJson, SnapshotFrame, SnapshotJson } from "../shared/protocol";
import { ConversationAgent } from "./conversation";
import type { Body } from "./body";
import { Repo } from "./files";
import { ownerOfAgent, UserId } from "./identity";
import { type HarnessFailed, Model, Pi } from "./harness";
import { CLOUDFLARE_OWNER_PREFIX, type CloudflareAuthEnv, directoryOf, inferenceOf } from "./auth/cloudflare";
import { modelOrDefault } from "./auth/catalog";
import { Meta } from "./meta";
import { Broadcast, DurableObjectContext, Store } from "./services";

export type AgentEnv = CloudflareAuthEnv & { readonly AI: Ai; readonly BODY: DurableObjectNamespace<Body>; readonly MODEL: string; readonly SKIN_AI_GATEWAY?: string };

const INFERENCE_OWNER = "inference-owner";

const chosenModel = (env: AgentEnv, owner: string) => async (): Promise<string> => {
	const inference = inferenceOf(env);
	const grant = await directoryOf(env).grantFor(owner);

	return modelOrDefault(grant?.model ?? null, inference.fallbackModel, inference.gateway);
};

const accountModel = (env: AgentEnv, owner: string): Layer.Layer<Model> => {
	const gateway = inferenceOf(env).gateway;
	const current = chosenModel(env, owner);

	return gateway === null ? Model.workersAIChosen(env.AI, current, env.MODEL) : Model.gateway(env.AI, gateway, current, env.MODEL);
};

const encodeSnapshot = Schema.encodeSync(SnapshotJson);

const encodeFrame = Schema.encodeSync(ServerFrameJson);

const encodeSend = Schema.encodeSync(SendOutcomeJson);

const encodeKill = Schema.encodeSync(KillOutcomeJson);

const encodeStop = Schema.encodeSync(StopOutcomeJson);

const encodeRead = Schema.encodeSync(ReadOutcomeJson);

export const conversationLayer = (ctx: DurableObjectState, model: Layer.Layer<Model>, files: Layer.Layer<Repo>) => {
	const object = Layer.mergeAll(DurableObjectContext.layer(ctx), Store.layer(ctx.storage));
	const broadcast = Broadcast.layer.pipe(Layer.provideMerge(object));
	const pi = Pi.layer(ctx.storage).pipe(Layer.provide(files), Layer.provideMerge(model), Layer.provideMerge(broadcast));

	return ConversationAgent.layer.pipe(Layer.provideMerge(pi));
};

const NO_OWNER = "u00000000000000000000";

const modelFor = (ctx: DurableObjectState, env: AgentEnv): Layer.Layer<Model> => {
	const owner = ctx.storage.kv.get<string>(INFERENCE_OWNER);

	return owner !== undefined && owner.startsWith(CLOUDFLARE_OWNER_PREFIX) ? accountModel(env, owner) : Model.workersAI(env.AI, env.MODEL);
};

const layerFor = (ctx: DurableObjectState, env: AgentEnv) =>
	conversationLayer(ctx, modelFor(ctx, env), Repo.layer(env.BODY, Option.getOrElse(ownerOfAgent(ctx.id.name), () => UserId.make(NO_OWNER))));

const RESERVED_CLOSE_CODES = new Set([1005, 1006, 1015]);

const sendableCloseCode = (code: number): number => (RESERVED_CLOSE_CODES.has(code) ? 1000 : code);

type Services = ConversationAgent | Broadcast | Store;

const withAgent = <A, E>(use: (agent: ConversationAgent["Service"]) => Effect.Effect<A, E>): Effect.Effect<A, E, ConversationAgent> =>
	Effect.gen(function* () {
		return yield* use(yield* ConversationAgent);
	});

export class Agent extends DurableObject<AgentEnv> {
	private runtime: Option.Option<ManagedRuntime.ManagedRuntime<Services, HarnessFailed>> = Option.none();

	constructor(ctx: DurableObjectState, env: AgentEnv) {
		super(ctx, env);
	}

	private run<A, E>(name: Option.Option<ConversationName>, effect: Effect.Effect<A, E, Services>): Promise<A> {
		const runtime = Option.getOrElse(this.runtime, () => {
			const meta = new Meta(this.ctx.storage);

			if (Option.isSome(name)) meta.claimName(name.value);

			const created = ManagedRuntime.make(this.layer(this.ctx, meta.name()));

			this.runtime = Option.some(created);

			return created;
		});

		return runtime.runPromiseExit(effect).then((exit) => (Exit.isSuccess(exit) ? exit.value : this.reset(runtime).then(() => Promise.reject(Cause.squash(exit.cause)))));
	}

	protected layer(ctx: DurableObjectState, _name: ConversationName) {
		return layerFor(ctx, this.env);
	}

	private reset(runtime: ManagedRuntime.ManagedRuntime<Services, HarnessFailed>): Promise<void> {
		this.runtime = Option.none();

		return runtime.dispose();
	}

	getSnapshot(name: ConversationName): Promise<string> {
		return this.run(Option.some(name), withAgent((agent) => agent.snapshot).pipe(Effect.map(encodeSnapshot)));
	}

	useInferenceOf(owner: string): void {
		if (this.ctx.storage.kv.get<string>(INFERENCE_OWNER) === owner) return;

		this.ctx.storage.kv.put(INFERENCE_OWNER, owner);
		this.runtime = Option.none();
	}

	send(name: ConversationName, text: string): Promise<string> {
		return this.run(Option.some(name), withAgent((agent) => agent.send(text)).pipe(Effect.result, Effect.map(encodeSend)));
	}

	kill(name: ConversationName): Promise<string> {
		return this.run(Option.some(name), withAgent((agent) => agent.kill).pipe(Effect.result, Effect.map(encodeKill)));
	}

	stop(name: ConversationName): Promise<string> {
		return this.run(Option.some(name), withAgent((agent) => agent.stop).pipe(Effect.result, Effect.map(encodeStop)));
	}

	readFile(name: ConversationName, path: string): Promise<string> {
		return this.run(Option.some(name), withAgent((agent) => agent.readFile(path)).pipe(Effect.result, Effect.map(encodeRead)));
	}

	async forget(): Promise<void> {
		const current = this.runtime;

		this.runtime = Option.none();

		if (Option.isSome(current)) await current.value.dispose();

		for (const socket of this.ctx.getWebSockets()) socket.close(1000, "conversation deleted");

		await this.ctx.storage.deleteAlarm();
		await this.ctx.storage.deleteAll();
	}

	override async fetch(request: Request): Promise<Response> {
		const name = new Meta(this.ctx.storage).nameFromUrl(request.url);
		const snapshot = await this.run(name, withAgent((agent) => agent.snapshot));
		const pair = new WebSocketPair();

		this.ctx.acceptWebSocket(pair[1]);
		pair[1].send(encodeFrame(SnapshotFrame.make({ snapshot })));

		return new Response(null, { status: 101, webSocket: pair[0] });
	}

	override async webSocketClose(socket: WebSocket, code: number): Promise<void> {
		socket.close(sendableCloseCode(code), "bye");
	}

	override async alarm(): Promise<void> {
		await this.run(Option.none(), withAgent((agent) => agent.keepAlive));
	}
}

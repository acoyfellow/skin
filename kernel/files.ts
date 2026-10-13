import { Context, Effect, Layer, Option, Schema } from "effect";
import { type BodyState, BodyStateJson, type ConversationState, RollbackOutcomeJson, type ShipReport, ShipReportJson } from "../shared/protocol";
import type { Body } from "./body";
import type { UserId } from "./identity";

export class BodyUnavailable extends Schema.TaggedError<BodyUnavailable>()("BodyUnavailable", { reason: Schema.String }) {}

export type RepoFiles = {
	readonly list: Effect.Effect<ReadonlyArray<string>, BodyUnavailable>;
	readonly read: (path: string) => Effect.Effect<Option.Option<string>, BodyUnavailable>;
	readonly write: (path: string, content: string) => Effect.Effect<string, BodyUnavailable>;
	readonly remove: (path: string) => Effect.Effect<string, BodyUnavailable>;
	readonly ship: (message: string) => Effect.Effect<ShipReport, BodyUnavailable>;
	readonly rollback: (generation: number) => Effect.Effect<string, BodyUnavailable>;
	readonly state: Effect.Effect<BodyState, BodyUnavailable>;
	readonly markConversation: (name: string, state: ConversationState) => Effect.Effect<void, BodyUnavailable>;
};

const decodeState = Schema.decodeUnknownEffect(BodyStateJson);

const decodeReport = Schema.decodeUnknownEffect(ShipReportJson);

const decodeRollback = Schema.decodeUnknownEffect(RollbackOutcomeJson);

const decodeList = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Array(Schema.String)));

const unreadable = (error: Schema.SchemaError) => new BodyUnavailable({ reason: `unreadable reply from the body: ${error.message}` });

type BodyStub = DurableObjectStub<Body>;

const call = <A>(run: () => Promise<A>) => Effect.tryPromise({ try: run, catch: (cause) => new BodyUnavailable({ reason: String(cause) }) });

export const bodyFiles = (body: () => BodyStub): RepoFiles => ({
	list: call(() => body().list()).pipe(Effect.flatMap((json) => Effect.mapError(decodeList(json), unreadable))),
	read: (path) => call(() => body().read(path)).pipe(Effect.map(Option.fromNullishOr)),
	write: (path, content) => call(() => body().write(path, content)),
	remove: (path) => call(() => body().remove(path)),
	ship: (message) => call(() => body().ship(message)).pipe(Effect.flatMap((json) => Effect.mapError(decodeReport(json), unreadable))),
	rollback: (generation) =>
		call(() => body().rollback(generation)).pipe(
			Effect.flatMap((json) => Effect.mapError(decodeRollback(json), unreadable)),
			Effect.map((outcome) =>
				outcome._tag === "Success"
					? `Generation ${outcome.success} is live again, and the draft now matches it.`
					: outcome.failure._tag === "NoSuchGeneration"
						? `There is no generation ${outcome.failure.generation}.`
						: `Generation ${outcome.failure.generation} never passed the gate, so it cannot go live.`,
			),
		),
	state: call(() => body().state()).pipe(Effect.flatMap((json) => Effect.mapError(decodeState(json), unreadable))),
	markConversation: (name, state) => call(() => body().markConversation(name, state)),
});

export class Repo extends Context.Service<Repo, RepoFiles>()("skin/Repo") {
	static readonly layer = (namespace: DurableObjectNamespace<Body>, user: UserId) => Layer.succeed(Repo, bodyFiles(() => namespace.getByName(user)));
}

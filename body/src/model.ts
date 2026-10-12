import { Schema } from "effect";
import { defineTaggedUnion } from "foldkit/schema";
import { Block, BodyState, ConversationName, Live, TimelineEvent } from "./kernel/protocol";

export const Phase = defineTaggedUnion({
	Connecting: {},
	Idle: {},
	Working: {},
	Dead: { killedAt: Schema.Number },
	Reviving: { killedAt: Schema.Number },
});

export type Phase = typeof Phase.Type;

export const LocalNote = Schema.Struct({ at: Schema.Number, afterBlock: Schema.Number, reason: Schema.String });

export type LocalNote = typeof LocalNote.Type;

export const OpenFile = defineTaggedUnion({
	Closed: {},
	Loading: { path: Schema.String, at: Schema.String },
	Loaded: { path: Schema.String, at: Schema.String, body: Schema.String },
});

export type OpenFile = typeof OpenFile.Type;

export const Model = Schema.Struct({
	name: ConversationName,
	phase: Phase,
	connected: Schema.Boolean,
	connectionEpoch: Schema.Number,
	failedConnects: Schema.Number,
	lives: Schema.Number,
	busy: Schema.Boolean,
	blocks: Schema.Array(Block),
	live: Schema.Option(Live),
	body: BodyState,
	bodyVersion: Schema.Number,
	rollbackError: Schema.Option(Schema.String),
	filesError: Schema.Option(Schema.String),
	events: Schema.Array(TimelineEvent),
	localNotes: Schema.Array(LocalNote),
	draft: Schema.String,
	openFile: OpenFile,
	filesPanelOpen: Schema.Boolean,
	openThoughts: Schema.Array(Schema.String),
	now: Schema.Number,
	activitySince: Schema.Number,
	activityKey: Schema.String,
});

export type Model = typeof Model.Type;

export const EXAMPLES = [
	"Add a notes panel that saves to the server and survives every generation",
	"Switch the whole app to a dark theme",
	"Show a clock in the header that ticks every second",
] as const;

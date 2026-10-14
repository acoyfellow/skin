import { Schema } from "effect";
import { defineTaggedUnion } from "foldkit/schema";
import { Block, BodyState, ConversationName, ConversationSummary, Live, TimelineEvent } from "./kernel/protocol";

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

export const VersionFilter = Schema.Literals(["all", "problems", "shipped"]);

export type VersionFilter = typeof VersionFilter.Type;

export const Model = Schema.Struct({
	name: ConversationName,
	phase: Phase,
	connected: Schema.Boolean,
	healthy: Schema.Boolean,
	loaded: Schema.Boolean,
	isNew: Schema.Boolean,
	connectionEpoch: Schema.Number,
	failedConnects: Schema.Number,
	lives: Schema.Number,
	busy: Schema.Boolean,
	blocks: Schema.Array(Block),
	live: Schema.Option(Live),
	body: BodyState,
	bodyVersion: Schema.Number,
	rollbackError: Schema.Option(Schema.String),
	conversations: Schema.Array(ConversationSummary),
	conversationsError: Schema.Option(Schema.String),
	resetting: Schema.Boolean,
	resetNote: Schema.Option(Schema.String),
	filesError: Schema.Option(Schema.String),
	events: Schema.Array(TimelineEvent),
	localNotes: Schema.Array(LocalNote),
	draft: Schema.String,
	openFile: OpenFile,
	filesPanelOpen: Schema.Boolean,
	openThoughts: Schema.Array(Schema.String),
	openVersion: Schema.Option(Schema.Number),
	versionFilter: VersionFilter,
	now: Schema.Number,
	activitySince: Schema.Number,
	turnSince: Schema.Option(Schema.Number),
	following: Schema.Boolean,
	lastSent: Schema.String,
	stopping: Schema.Boolean,
	copiedKey: Schema.String,
	draftSlot: Schema.String,
	chatSearch: Schema.String,
	confirmingDelete: Schema.Option(Schema.String),
	unseenFrom: Schema.Option(Schema.Number),
	activityKey: Schema.String,
});

export type Model = typeof Model.Type;

export const EXAMPLES = [
	"Add a notes panel that saves to the server and survives every version",
	"Switch the whole app to a dark theme",
	"Show a clock in the header that ticks every second",
] as const;

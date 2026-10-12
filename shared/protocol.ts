import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

export const ConversationName = Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9-]{0,63}$/)).pipe(Schema.brand("ConversationName"));

export type ConversationName = typeof ConversationName.Type;

export const GenerationStatus = Schema.Literals(["building", "rejected", "ready", "live", "retired"]);

export type GenerationStatus = typeof GenerationStatus.Type;

export const Check = Schema.Struct({ name: Schema.String, ok: Schema.Boolean, detail: Schema.String, ms: Schema.Number });

export type Check = typeof Check.Type;

export const Generation = Schema.Struct({
	id: Schema.Number,
	parent: Schema.OptionFromNullOr(Schema.Number),
	message: Schema.String,
	status: GenerationStatus,
	createdAt: Schema.Number,
	files: Schema.Number,
	checks: Schema.Array(Check),
	boots: Schema.Number,
	crashes: Schema.Number,
	note: Schema.String,
});

export type Generation = typeof Generation.Type;

export const BodyState = Schema.Struct({
	files: Schema.Array(Schema.String),
	generations: Schema.Array(Generation),
	live: Schema.OptionFromNullOr(Schema.Number),
	dirty: Schema.Boolean,
});

export type BodyState = typeof BodyState.Type;

export const BodyStateJson = Schema.fromJsonString(Schema.toCodecJson(BodyState));

export const ShipStatus = Schema.Literals(["live", "rejected", "unchanged"]);

export const ShipReport = Schema.Struct({ generation: Schema.Number, status: ShipStatus, checks: Schema.Array(Check), reason: Schema.String });

export type ShipReport = typeof ShipReport.Type;

export const ShipReportJson = Schema.fromJsonString(Schema.toCodecJson(ShipReport));

export const UserBlock = Schema.TaggedStruct("UserText", { text: Schema.String });

export const ReplyBlock = Schema.TaggedStruct("Reply", { text: Schema.String });

export const ThoughtBlock = Schema.TaggedStruct("Thought", { text: Schema.String });

export const ToolBlock = Schema.TaggedStruct("Tool", {
	callId: Schema.String,
	name: Schema.String,
	path: Schema.String,
	draft: Schema.String,
	result: Schema.OptionFromNullOr(Schema.Struct({ line: Schema.String, isError: Schema.Boolean })),
});

export const Block = Schema.Union([UserBlock, ReplyBlock, ThoughtBlock, ToolBlock]);

export type Block = typeof Block.Type;

export type ToolBlock = typeof ToolBlock.Type;

export const Activity = Schema.Literals(["waiting", "thinking", "replying", "writing", "calling", "running"]);

export type Activity = typeof Activity.Type;

export const ActivityLine = Schema.Struct({ activity: Activity, detail: Schema.String });

export type ActivityLine = typeof ActivityLine.Type;

export const Live = Schema.Struct({ ...ActivityLine.fields, blocks: Schema.Array(Block) });

export type Live = typeof Live.Type;

export const KilledEvent = Schema.TaggedStruct("Killed", { at: Schema.Number, afterBlock: Schema.Number, wasBusy: Schema.Boolean });

export const BackEvent = Schema.TaggedStruct("Back", { at: Schema.Number, afterBlock: Schema.Number, afterMs: Schema.Number, lives: Schema.Number, resumed: Schema.Boolean });

export const FailedEvent = Schema.TaggedStruct("Failed", { at: Schema.Number, afterBlock: Schema.Number, reason: Schema.String });

export const RestartedEvent = Schema.TaggedStruct("Resumed", { at: Schema.Number, afterBlock: Schema.Number, lives: Schema.Number });

export const TimelineEvent = Schema.Union([KilledEvent, BackEvent, RestartedEvent, FailedEvent]);

export type TimelineEvent = typeof TimelineEvent.Type;

export const Snapshot = Schema.Struct({
	name: ConversationName,
	model: Schema.String,
	lives: Schema.Number,
	busy: Schema.Boolean,
	blocks: Schema.Array(Block),
	live: Schema.OptionFromNullOr(Live),
	body: BodyState,
	events: Schema.Array(TimelineEvent),
	killedAt: Schema.OptionFromNullOr(Schema.Number),
	filesError: Schema.OptionFromNullOr(Schema.String),
});

export type Snapshot = typeof Snapshot.Type;

export const SnapshotFrame = Schema.TaggedStruct("Snapshot", { snapshot: Snapshot });

export const LiveFrame = Schema.TaggedStruct("Live", { live: Schema.OptionFromNullOr(Live) });

export const BlocksFrame = Schema.TaggedStruct("Blocks", { blocks: Schema.Array(Block) });

export const BodyFrame = Schema.TaggedStruct("Body", { body: BodyState });

export const BusyFrame = Schema.TaggedStruct("Busy", { busy: Schema.Boolean });

export const KilledFrame = Schema.TaggedStruct("Killed", { killedAt: Schema.Number });

export const EventsFrame = Schema.TaggedStruct("Events", { events: Schema.Array(TimelineEvent) });

export const RevivedFrame = Schema.TaggedStruct("Revived", { lives: Schema.Number });

export const ServerFrame = Schema.Union([SnapshotFrame, LiveFrame, BlocksFrame, BodyFrame, BusyFrame, KilledFrame, RevivedFrame, EventsFrame]);

export type ServerFrame = typeof ServerFrame.Type;

export const ServerFrameJson = Schema.fromJsonString(ServerFrame);

export class StillWorking extends Schema.TaggedError<StillWorking>()("StillWorking", {}) {}

export class NothingRunning extends Schema.TaggedError<NothingRunning>()("NothingRunning", {}) {}

export class KillNotSaved extends Schema.TaggedError<KillNotSaved>()("KillNotSaved", { reason: Schema.String }) {}

export class AgentUnavailable extends Schema.TaggedError<AgentUnavailable>()("AgentUnavailable", { reason: Schema.String }) {}

export const KILLED_FROM_THE_UI = "killed from the UI";

export class FilesUnavailable extends Schema.TaggedError<FilesUnavailable>()("FilesUnavailable", { reason: Schema.String }) {}

export class FileNotFound extends Schema.TaggedError<FileNotFound>()("FileNotFound", { path: Schema.String }) {}

const Accepted = Schema.Struct({ id: Schema.String });

const SendOutcome = Schema.Result(Accepted, StillWorking);

const KillOutcome = Schema.Result(Schema.Void, Schema.Union([NothingRunning, KillNotSaved]));

const ReadOutcome = Schema.Result(Schema.String, Schema.Union([FileNotFound, FilesUnavailable]));

export class NoSuchGeneration extends Schema.TaggedError<NoSuchGeneration>()("NoSuchGeneration", { generation: Schema.Number }) {}

export class GenerationRejected extends Schema.TaggedError<GenerationRejected>()("GenerationRejected", { generation: Schema.Number }) {}

const RollbackOutcome = Schema.Result(Schema.Number, Schema.Union([NoSuchGeneration, GenerationRejected]));

export const RollbackOutcomeJson = Schema.fromJsonString(Schema.toCodecJson(RollbackOutcome));

const MAX_INPUT = 8000;

const Input = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(MAX_INPUT));

const target = { name: ConversationName };

export const AgentRpcs = RpcGroup.make(
	Rpc.make("Snapshot", { payload: target, success: Snapshot, error: AgentUnavailable }),
	Rpc.make("Send", { payload: { ...target, text: Input }, success: Accepted, error: Schema.Union([StillWorking, AgentUnavailable]) }),
	Rpc.make("Kill", { payload: target, error: Schema.Union([NothingRunning, KillNotSaved, AgentUnavailable]) }),
	Rpc.make("ReadFile", { payload: { ...target, path: Schema.String }, success: Schema.String, error: Schema.Union([FileNotFound, FilesUnavailable, AgentUnavailable]) }),
	Rpc.make("Body", { success: BodyState, error: FilesUnavailable }),
	Rpc.make("Rollback", { payload: { generation: Schema.Number }, success: Schema.Number, error: Schema.Union([NoSuchGeneration, GenerationRejected, FilesUnavailable]) }),
);

export type AgentRpcs = typeof AgentRpcs;

export const KERNEL_PREFIX = "/_kernel";

export const RPC_PATH = `${KERNEL_PREFIX}/api/rpc`;

export const socketPath = (name: ConversationName) => `${KERNEL_PREFIX}/api/c/${name}/ws`;

export const BODY_SOCKET_PATH = `${KERNEL_PREFIX}/api/body/ws`;

export const REPORT_PATH = `${KERNEL_PREFIX}/api/report`;

export const PIN_COOKIE = "generation";

export const BootReport = Schema.Struct({ generation: Schema.Number, ok: Schema.Boolean, detail: Schema.String });

export type BootReport = typeof BootReport.Type;

export const BootReportJson = Schema.fromJsonString(BootReport);

export const BODY_HEALTH_PATH = "/_body/health";

export const BODY_CHECKS_PATH = "/_body/checks";

export const BodyChecks = Schema.Struct({ checks: Schema.Array(Check) });

export const BodyChecksJson = Schema.fromJsonString(BodyChecks);

export const SnapshotJson = Schema.fromJsonString(Schema.toCodecJson(Snapshot));

export const SendOutcomeJson = Schema.fromJsonString(Schema.toCodecJson(SendOutcome));

export const KillOutcomeJson = Schema.fromJsonString(Schema.toCodecJson(KillOutcome));

export const ReadOutcomeJson = Schema.fromJsonString(Schema.toCodecJson(ReadOutcome));

import { Schema } from "effect";
import { defineMessageUnion } from "foldkit/message";
import { ConversationSummary, ServerFrame } from "./kernel/protocol";
import { VersionFilter } from "./model";

export const Message = defineMessageUnion({
	ReceivedFrame: { frame: ServerFrame },
	SocketOpened: {},
	SocketClosed: {},
	UpdatedDraft: { value: Schema.String },
	SubmittedDraft: {},
	ClickedExample: { text: Schema.String },
	SucceededSend: {},
	FailedSend: { reason: Schema.String },
	ClickedNew: {},
	ToggledFilesPanel: {},
	ClickedFile: { path: Schema.String },
	LoadedFile: { path: Schema.String, at: Schema.String, body: Schema.String },
	ToggledThought: { key: Schema.String },
	Ticked: { now: Schema.Number },
	CompletedNavigation: {},
	ClickedRollback: { generation: Schema.Number },
	LoadedConversations: { conversations: Schema.Array(ConversationSummary) },
	ClickedConversation: { name: Schema.String },
	ClickedDeleteConversation: { name: Schema.String },
	DeletedConversation: { name: Schema.String },
	FailedConversations: { reason: Schema.String },
	ClickedResetApp: {},
	FinishedResetApp: { note: Schema.String },
	SucceededRollback: { generation: Schema.Number },
	FailedRollback: { reason: Schema.String },
	ToggledVersion: { generation: Schema.Number },
	ChoseVersionFilter: { filter: VersionFilter },
	ClosedFile: {},
});

export type Message = typeof Message.Type;

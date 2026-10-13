import { Effect, Schema } from "effect";
import { Command, Navigation } from "foldkit";
import { ConversationName } from "./kernel/protocol";
import { Message } from "./message";
import { saveDraft } from "./composer";
import { JUMP_EVENT } from "./follow";
import { AgentClient } from "./rpc";

const reasonOf = (error: { readonly message: string }) => error.message;

export const Send = Command.define("Send", {
	args: { name: ConversationName, text: Schema.String },
	messages: [Message.SucceededSend, Message.FailedSend],
	execute: ({ name, text }) =>
		Effect.gen(function* () {
			const client = yield* AgentClient;

			yield* client.Send({ name, text });

			return Message.SucceededSend();
		}).pipe(
			Effect.catchTag("StillWorking", () => Effect.succeed(Message.FailedSend({ reason: "Still working on the last message." }))),
			Effect.catch((error) => Effect.succeed(Message.FailedSend({ reason: reasonOf(error) }))),
		),
});

export const Rollback = Command.define("Rollback", {
	args: { generation: Schema.Number },
	messages: [Message.SucceededRollback, Message.FailedRollback],
	execute: ({ generation }) =>
		Effect.gen(function* () {
			const client = yield* AgentClient;
			const live = yield* client.Rollback({ generation });

			return Message.SucceededRollback({ generation: live });
		}).pipe(Effect.catch((error) => Effect.succeed(Message.FailedRollback({ reason: error.message === "" ? error._tag : error.message })))),
});

const reason = (error: { readonly message: string; readonly _tag: string }) => (error.message === "" ? error._tag : error.message);

export const LoadConversations = Command.define("LoadConversations", {
	messages: [Message.LoadedConversations, Message.FailedConversations],
	execute: Effect.gen(function* () {
		const client = yield* AgentClient;

		return Message.LoadedConversations({ conversations: yield* client.Conversations() });
	}).pipe(Effect.catch((error) => Effect.succeed(Message.FailedConversations({ reason: reason(error) })))),
});

export const DeleteConversation = Command.define("DeleteConversation", {
	args: { name: ConversationName },
	messages: [Message.DeletedConversation, Message.FailedConversations],
	execute: ({ name }) =>
		Effect.gen(function* () {
			const client = yield* AgentClient;

			yield* client.DeleteConversation({ name });

			return Message.DeletedConversation({ name });
		}).pipe(Effect.catch((error) => Effect.succeed(Message.FailedConversations({ reason: reason(error) })))),
});

export const OpenConversation = Command.define("OpenConversation", {
	args: { name: ConversationName },
	messages: [Message.CompletedNavigation],
	execute: ({ name }) => Navigation.load(`/c/${name}`).pipe(Effect.as(Message.CompletedNavigation())),
});

export const ResetApp = Command.define("ResetApp", {
	messages: [Message.FinishedResetApp],
	execute: Effect.gen(function* () {
		const client = yield* AgentClient;
		const report = yield* client.ResetApp();

		return Message.FinishedResetApp({ note: report.status === "live" ? `Version ${report.generation} is the original app again.` : `The reset was not applied: ${report.reason}` });
	}).pipe(Effect.catch((error) => Effect.succeed(Message.FinishedResetApp({ note: `The reset failed: ${reason(error)}` })))),
});

export const LoadFile = Command.define("LoadFile", {
	args: { name: ConversationName, path: Schema.String, at: Schema.String },
	messages: [Message.LoadedFile],
	execute: ({ name, path, at }) =>
		Effect.gen(function* () {
			const client = yield* AgentClient;

			return yield* client.ReadFile({ name, path });
		}).pipe(
			Effect.orElseSucceed(() => "(could not read file)"),
			Effect.map((body) => Message.LoadedFile({ path, at, body })),
		),
});

export const ShowConversation = Command.define("ShowConversation", {
	args: { name: ConversationName },
	messages: [Message.CompletedNavigation],
	execute: ({ name }) => Navigation.replaceUrl(`/c/${name}`).pipe(Effect.as(Message.CompletedNavigation())),
});

export const StartNewConversation = Command.define("StartNewConversation", {
	messages: [Message.CompletedNavigation],
	execute: Navigation.load("/").pipe(Effect.as(Message.CompletedNavigation())),
});

export const JumpToLatest = Command.define("JumpToLatest", {
	messages: [Message.CompletedNavigation],
	execute: Effect.sync(() => {
		document.getElementById("log")?.dispatchEvent(new Event(JUMP_EVENT));

		return Message.CompletedNavigation();
	}),
});

export const Stop = Command.define("Stop", {
	args: { name: ConversationName },
	messages: [Message.FinishedStop],
	execute: ({ name }) =>
		Effect.gen(function* () {
			const client = yield* AgentClient;

			yield* client.Stop({ name });

			return Message.FinishedStop({ reason: "" });
		}).pipe(
			Effect.catchTag("NothingRunning", () => Effect.succeed(Message.FinishedStop({ reason: "" }))),
			Effect.catch((error) => Effect.succeed(Message.FinishedStop({ reason: reason(error) }))),
		),
});

export const SaveDraft = Command.define("SaveDraft", {
	args: { name: ConversationName, text: Schema.String },
	messages: [Message.SavedDraft],
	execute: ({ name, text }) =>
		Effect.clockWith((clock) => clock.currentTimeMillis).pipe(
			Effect.map((now) => {
				saveDraft(name, text, now);

				return Message.SavedDraft();
			}),
		),
});

export const CopyText = Command.define("CopyText", {
	args: { key: Schema.String, text: Schema.String },
	messages: [Message.FinishedCopy],
	execute: ({ key, text }) =>
		Effect.tryPromise(() => navigator.clipboard.writeText(text)).pipe(
			Effect.as(Message.FinishedCopy({ key, ok: true })),
			Effect.orElseSucceed(() => Message.FinishedCopy({ key, ok: false })),
		),
});

export const ClearCopied = Command.define("ClearCopied", {
	args: { key: Schema.String },
	messages: [Message.ExpiredCopied],
	execute: ({ key }) => Effect.sleep("1200 millis").pipe(Effect.as(Message.ExpiredCopied({ key }))),
});

import { Match, Option } from "effect";
import type { Command, Update } from "foldkit";
import { modifyFields } from "foldkit/struct";
import { ConversationName, type ServerFrame, type Snapshot, UserBlock } from "./kernel/protocol";
import { DeleteConversation, LoadConversations, LoadFile, OpenConversation, ResetApp, Rollback, Send, ShowConversation, StartNewConversation } from "./command";
import { Message } from "./message";
import { type Model, OpenFile, Phase } from "./model";
import type { AgentClient } from "./rpc";
import { activityKey } from "./view/activity";

type UpdateReturn = Update.Return<Model, Message, AgentClient>;

type AnyCommand = Command.Command<Message, never, AgentClient>;

const isDown = (phase: Phase): boolean => Phase.isAnyOf(["Dead", "Reviving"])(phase);

const withNote = (model: Model, reason: string): Model =>
	modifyFields(model, { localNotes: (notes) => [...notes, { at: model.now, afterBlock: model.blocks.length, reason }] });

const latestCommit = (model: Model): string => String(model.bodyVersion);

const refreshOpenFile = (model: Model): { readonly model: Model; readonly commands: ReadonlyArray<AnyCommand> } =>
	OpenFile.match(model.openFile, {
		Closed: () => ({ model, commands: [] }),
		Loading: () => ({ model, commands: [] }),
		Loaded: ({ path, at }) => {
			const head = latestCommit(model);

			return at === head
				? { model, commands: [] }
				: { model: modifyFields(model, { openFile: () => OpenFile.Loading({ path, at: head }) }), commands: [LoadFile({ name: model.name, path, at: head })] };
		},
	});

const withActivity = (model: Model): Model => {
	const key = activityKey(model);

	return key === model.activityKey ? model : modifyFields(model, { activityKey: () => key, activitySince: () => model.now });
};

const conversationStartedAt = (model: Model): Option.Option<number> =>
	Option.map(Option.fromNullishOr(model.conversations.find((conversation) => conversation.name === model.name)), (conversation) => conversation.updatedAt);

const withTurn = (model: Model, busy: boolean): Model =>
	modifyFields(model, {
		turnSince: (since) => (busy ? Option.orElse(since, () => Option.some(Option.getOrElse(conversationStartedAt(model), () => model.now))) : Option.none()),
	});

const settlePhase = (model: Model, busy: boolean): Model =>
	withTurn(modifyFields(model, { busy: () => busy, phase: () => (busy ? Phase.Working() : Phase.Idle()) }), busy);

const phaseFor = (snapshot: Snapshot, connected: boolean): Phase =>
	Option.match(snapshot.killedAt, {
		onSome: (killedAt) => (connected ? Phase.Reviving({ killedAt }) : Phase.Dead({ killedAt })),
		onNone: () => (snapshot.busy ? Phase.Working() : Phase.Idle()),
	});

const applySnapshot = (model: Model, snapshot: Snapshot): Model =>
	modifyFields(model, {
		lives: () => snapshot.lives,
		busy: () => snapshot.busy,
		blocks: () => snapshot.blocks,
		live: () => snapshot.live,
		body: () => snapshot.body,
		bodyVersion: (version) => version + 1,
		filesError: () => snapshot.filesError,
		events: () => snapshot.events,
		localNotes: () => [],
		phase: () => phaseFor(snapshot, model.connected),
		turnSince: (since) => (snapshot.busy ? Option.orElse(since, () => Option.some(Option.getOrElse(conversationStartedAt(model), () => model.now))) : Option.none()),
	});

const markKilled = (model: Model, killedAt: number): Model =>
	isDown(model.phase) ? model : modifyFields(model, { phase: () => Phase.Dead({ killedAt }), live: () => Option.none() });

const onFrame = (model: Model, frame: ServerFrame): UpdateReturn => {
	const next = Match.value(frame).pipe(
		Match.tagsExhaustive({
			Snapshot: ({ snapshot }) => applySnapshot(model, snapshot),
			Live: ({ live }) => modifyFields(model, { live: () => live }),
			Blocks: ({ blocks }) => modifyFields(model, { blocks: () => blocks }),
			Body: ({ body }) => modifyFields(model, { body: () => body, bodyVersion: (version) => version + 1 }),
			Busy: ({ busy }) => settlePhase(busy ? model : modifyFields(model, { live: () => Option.none() }), busy),
			Killed: ({ killedAt }) => markKilled(model, killedAt),
			Revived: ({ lives }) => modifyFields(model, { lives: () => lives }),
			Events: ({ events }) => modifyFields(model, { events: () => events }),
		}),
	);

	const refreshed = refreshOpenFile(withActivity(next));

	return next.busy === model.busy ? refreshed : { model: refreshed.model, commands: [...refreshed.commands, LoadConversations()] };
};

const send = (model: Model, text: string): UpdateReturn => {
	const trimmed = text.trim();

	if (trimmed === "" || model.busy || isDown(model.phase)) return { model };

	const pending = modifyFields(model, {
		draft: () => "",
		busy: () => true,
		phase: () => Phase.Working(),
		blocks: (blocks) => [...blocks, UserBlock.make({ text: trimmed })],
		turnSince: () => Option.some(model.now),
	});

	return { model: withActivity(pending), commands: [Send({ name: model.name, text: trimmed }), ShowConversation({ name: model.name })] };
};

const toggled = (items: ReadonlyArray<string>, item: string) => (items.includes(item) ? items.filter((each) => each !== item) : [...items, item]);

export const update = (model: Model, message: Message): UpdateReturn =>
	Message.match<UpdateReturn>(message, {
		ReceivedFrame: ({ frame }) => onFrame(model, frame),
		SocketOpened: () => ({ model: modifyFields(model, { connected: () => true, failedConnects: () => 0 }) }),
		SocketClosed: () => ({
			model: modifyFields(model, {
				connected: () => false,
				connectionEpoch: (epoch) => epoch + 1,
				failedConnects: (failures) => (model.connected ? 0 : failures + 1),
				phase: (phase) =>
					Match.value(phase).pipe(
						Match.tag("Dead", ({ killedAt }) => Phase.Reviving({ killedAt })),
						Match.tag("Reviving", (reviving) => reviving),
						Match.orElse(() => Phase.Connecting()),
					),
			}),
		}),
		UpdatedDraft: ({ value }) => ({ model: modifyFields(model, { draft: () => value }) }),
		SubmittedDraft: () => send(model, model.draft),
		ClickedExample: ({ text }) => send(model, text),
		SucceededSend: () => ({ model, commands: [LoadConversations()] }),
		FailedSend: ({ reason }) => ({ model: settlePhase(withNote(model, reason), false) }),
		ClickedNew: () => ({ model, commands: [StartNewConversation()] }),
		ToggledFilesPanel: () => ({ model: modifyFields(model, { filesPanelOpen: (open) => !open }) }),
		ClickedFile: ({ path }) =>
			OpenFile.match(model.openFile, {
				Loaded: (open) => (open.path === path ? { model: modifyFields(model, { openFile: () => OpenFile.Closed() }) } : openFile(model, path)),
				Loading: (open) => (open.path === path ? { model: modifyFields(model, { openFile: () => OpenFile.Closed() }) } : openFile(model, path)),
				Closed: () => openFile(model, path),
			}),
		LoadedFile: ({ path, at, body }) =>
			OpenFile.match(model.openFile, {
				Loading: (open) => (open.path === path && open.at === at ? { model: modifyFields(model, { openFile: () => OpenFile.Loaded({ path, at, body }) }) } : { model }),
				Loaded: () => ({ model }),
				Closed: () => ({ model }),
			}),
		ToggledThought: ({ key }) => ({ model: modifyFields(model, { openThoughts: (open) => toggled(open, key) }) }),
		Ticked: ({ now }) => ({ model: modifyFields(model, { now: () => now }) }),
		PolledConversations: () => ({ model, commands: [LoadConversations()] }),
		CompletedNavigation: () => ({ model }),
		LoadedConversations: ({ conversations }) => ({ model: modifyFields(model, { conversations: () => conversations, conversationsError: () => Option.none() }) }),
		FailedConversations: ({ reason }) => ({ model: modifyFields(model, { conversationsError: () => Option.some(reason) }) }),
		ClickedConversation: ({ name }) => (name === model.name ? { model } : { model, commands: [OpenConversation({ name: ConversationName.make(name) })] }),
		ClickedDeleteConversation: ({ name }) => ({
			model: modifyFields(model, { conversations: (all) => all.filter((conversation) => conversation.name !== name) }),
			commands: [DeleteConversation({ name: ConversationName.make(name) })],
		}),
		DeletedConversation: ({ name }) => ({ model, commands: name === model.name ? [StartNewConversation()] : [LoadConversations()] }),
		ClickedResetApp: () => (model.resetting ? { model } : { model: modifyFields(model, { resetting: () => true, resetNote: () => Option.none() }), commands: [ResetApp()] }),
		FinishedResetApp: ({ note }) => ({ model: modifyFields(model, { resetting: () => false, resetNote: () => Option.some(note) }) }),
		ClickedRollback: ({ generation }) => ({ model: modifyFields(model, { rollbackError: () => Option.none() }), commands: [Rollback({ generation })] }),
		SucceededRollback: () => ({ model }),
		FailedRollback: ({ reason }) => ({ model: modifyFields(model, { rollbackError: () => Option.some(reason) }) }),
		ToggledVersion: ({ generation }) => ({
			model: modifyFields(model, { openVersion: (open) => (Option.contains(open, generation) ? Option.none() : Option.some(generation)) }),
		}),
		ChoseVersionFilter: ({ filter }) => ({ model: modifyFields(model, { versionFilter: () => filter }) }),
		ClosedFile: () => ({ model: modifyFields(model, { openFile: () => OpenFile.Closed() }) }),
	});

const openFile = (model: Model, path: string): UpdateReturn => {
	const at = latestCommit(model);

	return { model: modifyFields(model, { openFile: () => OpenFile.Loading({ path, at }) }), commands: [LoadFile({ name: model.name, path, at })] };
};

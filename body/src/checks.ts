import { Duration, Option } from "effect";
import { Command, given, message, model, story } from "foldkit/story";
import { describe, expect, test } from "./check";
import {
	BackEvent,
	BusyFrame,
	ConversationName,
	EventsFrame,
	KilledEvent,
	RestartedEvent,
	KilledFrame,
	ReplyBlock,
	RevivedFrame,
	type Snapshot,
	SnapshotFrame,
	UserBlock,
} from "./kernel/protocol";
import { DeleteConversation, JumpToLatest, LoadConversations, SaveDraft, Stop, Send, ShowConversation, StartNewConversation } from "./command";
import { initialModel } from "./main";
import { Message } from "./message";
import { isOffline, reconnectDelay } from "./socket";
import { Phase } from "./model";
import { update } from "./update";
import { decideComposerKey } from "./composer";
import { parseBlocks, parseInline } from "./view/markdown";
import { dayGroup } from "./view/chats";
import { clock, turnSeconds } from "./view/activity";

const name = ConversationName.make("c-story");

const offline = initialModel({ name, isNew: true, now: 1_000 });

const fresh = { ...offline, connected: true };

const snapshot = (overrides: Partial<Snapshot>): Snapshot => ({
	name,
	model: "test-model",
	lives: 1,
	busy: false,
	blocks: [],
	live: Option.none(),
	body: { files: [], generations: [], live: Option.none(), dirty: false },
	events: [],
	killedAt: Option.none(),
	filesError: Option.none(),
	...overrides,
});

const frame = (value: Parameters<typeof Message.ReceivedFrame>[0]["frame"]) => Message.ReceivedFrame({ frame: value });

describe("files", () => {
	test("when the file store is down, the page says so instead of showing an empty repository", () => {
		story(
			update,
			given(fresh),
			message(frame(SnapshotFrame.make({ snapshot: snapshot({ filesError: Option.some("Files are unavailable: RepoUnavailable") }) }))),
			model((current) => {
				expect(current.filesError).toEqual(Option.some("Files are unavailable: RepoUnavailable"));
			}),
		);
	});
});

describe("reconnecting", () => {
	test("each failed connect waits longer, up to ten seconds, and a good connect resets the wait", () => {
		expect([0, 1, 2, 3, 10].map((failures) => Duration.toMillis(reconnectDelay(failures)))).toEqual([0, 500, 1000, 2000, 10000]);

		story(
			update,
			given(offline),
			message(Message.SocketClosed()),
			message(Message.SocketClosed()),
			model((current) => {
				expect(current.failedConnects).toBe(2);
			}),
			message(Message.SocketOpened()),
			message(frame(SnapshotFrame.make({ snapshot: snapshot({}) }))),
			model((current) => {
				expect(current.failedConnects).toBe(0);
			}),
		);
	});
});

describe("connecting", () => {
	test("the first snapshot moves the page from connecting to idle", () => {
		story(
			update,
			given(fresh),
			message(Message.SocketOpened()),
			message(frame(SnapshotFrame.make({ snapshot: snapshot({}) }))),
			model((current) => {
				expect(current.connected).toBe(true);
				expect(current.phase).toEqual(Phase.Idle());
			}),
		);
	});

	test("a busy snapshot moves the page to working", () => {
		story(
			update,
			given(fresh),
			message(frame(SnapshotFrame.make({ snapshot: snapshot({ busy: true, lives: 3 }) }))),
			Command.resolve(LoadConversations, Message.LoadedConversations({ conversations: [] })),
			model((current) => {
				expect(current.phase._tag).toBe("Working");
				expect(current.lives).toBe(3);
			}),
		);
	});
});

describe("sending", () => {
	test("an example sends the task, shows it at once, and puts the name in the URL", () => {
		story(
			update,
			given(fresh),
			message(Message.ClickedExample({ text: "  Build a page  " })),
			model((current) => {
				expect(current.busy).toBe(true);
				expect(current.blocks).toEqual([UserBlock.make({ text: "Build a page" })]);
			}),
			Command.expectHas(Send),
			Command.expectHas(ShowConversation),
			Command.resolve(Send, Message.SucceededSend()),
			Command.resolve(ShowConversation, Message.CompletedNavigation()),
			Command.resolve(JumpToLatest, Message.CompletedNavigation()),
			Command.resolve(SaveDraft, Message.SavedDraft()),
			Command.resolve(LoadConversations, Message.LoadedConversations({ conversations: [] })),
		);
	});

	test("an empty draft sends nothing", () => {
		story(update, given(fresh), message(Message.SubmittedDraft()), Command.expectNone());
	});

	test("a rejected send leaves the page idle and says why", () => {
		story(
			update,
			given(fresh),
			message(Message.ClickedExample({ text: "Build a page" })),
			Command.resolve(Send, Message.FailedSend({ reason: "Still working on the last message." })),
			Command.resolve(ShowConversation, Message.CompletedNavigation()),
			Command.resolve(JumpToLatest, Message.CompletedNavigation()),
			Command.resolve(SaveDraft, Message.SavedDraft()),
			model((current) => {
				expect(current.busy).toBe(false);
				expect(current.localNotes.at(-1)?.reason).toBe("Still working on the last message. Your message is back in the composer.");
				expect(current.draft).toBe("Build a page");
			}),
		);
	});

	test("a send while disconnected keeps the draft and says so", () => {
		story(
			update,
			given({ ...offline, draft: "Build a page" }),
			message(Message.SubmittedDraft()),
			Command.expectNone(),
			model((current) => {
				expect(current.draft).toBe("Build a page");
				expect(current.busy).toBe(false);
				expect(current.localNotes.at(-1)?.reason).toBe("Message not sent: reconnecting. Your draft is still in the composer.");
			}),
		);
	});

	test("Esc while working stops the agent, and Esc while idle does nothing", () => {
		story(
			update,
			given({ ...fresh, busy: true }),
			message(Message.PressedEscape()),
			model((current) => {
				expect(current.stopping).toBe(true);
			}),
			Command.expectHas(Stop),
			Command.resolve(Stop, Message.FinishedStop({ reason: "" })),
			model((current) => {
				expect(current.stopping).toBe(false);
			}),
		);
		story(update, given(fresh), message(Message.PressedEscape()), Command.expectNone());
	});

	test("a turn that ends with no reply says so once", () => {
		const asked = { ...fresh, busy: true, blocks: [UserBlock.make({ text: "Do it" })] };

		story(
			update,
			given(asked),
			message(frame(SnapshotFrame.make({ snapshot: snapshot({ busy: false, blocks: [UserBlock.make({ text: "Do it" })] }) }))),
			Command.resolve(LoadConversations, Message.LoadedConversations({ conversations: [] })),
			model((current) => {
				expect(current.localNotes.filter((note) => note.reason.startsWith("The agent finished without a visible reply")).length).toBe(1);
			}),
		);
	});
});

describe("restarts", () => {
	const working = update(fresh, frame(SnapshotFrame.make({ snapshot: snapshot({ busy: true }) }))).model;

	const killed = KilledEvent.make({ at: 5_000, afterBlock: 0, wasBusy: true });

	const back = BackEvent.make({ at: 7_900, afterBlock: 0, afterMs: 2_900, lives: 2, resumed: true });

	test("the kill shown on the page is the one the server recorded, shown once", () => {
		story(
			update,
			given(working),
			message(frame(KilledFrame.make({ killedAt: 5_000 }))),
			message(frame(EventsFrame.make({ events: [killed] }))),
			message(frame(KilledFrame.make({ killedAt: 5_000 }))),
			message(frame(EventsFrame.make({ events: [killed] }))),
			model((current) => {
				expect(current.events).toEqual([killed]);
				expect(current.phase).toEqual(Phase.Dead({ killedAt: 5_000 }));
			}),
		);
	});

	test("a page opened after a kill, before the comeback, shows the kill and that it is coming back", () => {
		story(
			update,
			given(fresh),
			message(Message.SocketOpened()),
			message(frame(SnapshotFrame.make({ snapshot: snapshot({ busy: true, lives: 2, events: [killed], killedAt: Option.some(5_000) }) }))),
			Command.resolve(LoadConversations, Message.LoadedConversations({ conversations: [] })),
			model((current) => {
				expect(current.events).toEqual([killed]);
				expect(current.phase).toEqual(Phase.Reviving({ killedAt: 5_000 }));
			}),
		);
	});

	test("a page opened after the comeback shows the kill and the comeback, exactly as the first tab saw them", () => {
		story(
			update,
			given(fresh),
			message(Message.SocketOpened()),
			message(frame(SnapshotFrame.make({ snapshot: snapshot({ busy: true, lives: 2, events: [killed, back] }) }))),
			Command.resolve(LoadConversations, Message.LoadedConversations({ conversations: [] })),
			model((current) => {
				expect(current.events).toEqual([killed, back]);
				expect(current.phase._tag).toBe("Working");
				expect(current.lives).toBe(2);
			}),
		);
	});

	test("a restart without a kill shows as a Restarted line and keeps working", () => {
		const restarted = RestartedEvent.make({ at: 9_000, afterBlock: 1, lives: 2 });

		story(
			update,
			given(working),
			message(frame(EventsFrame.make({ events: [restarted] }))),
			model((current) => {
				expect(current.events).toEqual([restarted]);
				expect(current.phase._tag).toBe("Working");
			}),
		);
	});

	test("after an interruption, the socket drops and reconnects, and the server's events replace the local guess", () => {
		story(
			update,
			given({ ...working, now: 5_000 }),
			message(frame(KilledFrame.make({ killedAt: 5_000 }))),
			message(Message.SocketClosed()),
			model((current) => {
				expect(current.phase).toEqual(Phase.Reviving({ killedAt: 5_000 }));
				expect(current.connectionEpoch).toBe(working.connectionEpoch + 1);
			}),
			message(Message.SocketOpened()),
			message(frame(RevivedFrame.make({ lives: 2 }))),
			message(frame(SnapshotFrame.make({ snapshot: snapshot({ busy: true, lives: 2, events: [killed, back] }) }))),
			model((current) => {
				expect(current.phase._tag).toBe("Working");
				expect(current.lives).toBe(2);
				expect(current.events).toEqual([killed, back]);
			}),
		);
	});

	test("a task shows its whole running time, and every chat shows working, idle, or failed", () => {
		story(
			update,
			given({ ...fresh, now: 10_000 }),
			message(Message.ClickedExample({ text: "Build a page" })),
			Command.resolve(Send, Message.SucceededSend()),
			Command.resolve(ShowConversation, Message.CompletedNavigation()),
			Command.resolve(JumpToLatest, Message.CompletedNavigation()),
			Command.resolve(SaveDraft, Message.SavedDraft()),
			Command.resolve(LoadConversations, Message.LoadedConversations({ conversations: [{ name: "c-story", title: "Build a page", updatedAt: 10_000, state: "working" }, { name: "c-broken", title: "Dark", updatedAt: 5_000, state: "failed" }] })),
			message(Message.Ticked({ now: 75_000 })),
			model((current) => {
				expect(turnSeconds(current)).toEqual(Option.some(65));
				expect(clock(65)).toBe("1m 05s");
				expect(current.conversations.map((conversation) => conversation.state)).toEqual(["working", "failed"]);
			}),
			message(frame(BusyFrame.make({ busy: false }))),
			Command.resolve(LoadConversations, Message.LoadedConversations({ conversations: [{ name: "c-story", title: "Build a page", updatedAt: 80_000, state: "idle" }] })),
			model((current) => {
				expect(current.turnSince).toEqual(Option.none());
				expect(current.conversations[0]?.state).toBe("idle");
			}),
		);
	});

	test("the run finishing ends the working state and keeps the reply", () => {
		story(
			update,
			given(working),
			message(frame(BusyFrame.make({ busy: false }))),
			Command.resolve(LoadConversations, Message.LoadedConversations({ conversations: [] })),
			message(frame(SnapshotFrame.make({ snapshot: snapshot({ blocks: [ReplyBlock.make({ text: "Done." })] }) }))),
			model((current) => {
				expect(current.phase._tag).toBe("Idle");
				expect(current.blocks).toEqual([ReplyBlock.make({ text: "Done." })]);
			}),
		);
	});
});

describe("chats", () => {
	const listed = update(fresh, Message.LoadedConversations({ conversations: [{ name: "c-other", title: "Make it dark", updatedAt: 900, state: "idle" }, { name: "c-story", title: "Add a clock", updatedAt: 800, state: "idle" }] })).model;

	test("deleting a chat asks first, then removes it at once and asks the server to forget it", () => {
		story(
			update,
			given(listed),
			message(Message.ClickedDeleteConversation({ name: "c-other" })),
			model((current) => {
				expect(current.confirmingDelete).toEqual(Option.some("c-other"));
				expect(current.conversations.length).toBe(2);
			}),
			message(Message.ConfirmedDeleteConversation({ name: "c-other" })),
			model((current) => {
				expect(current.conversations.map((conversation) => conversation.name)).toEqual(["c-story"]);
			}),
			Command.expectHas(DeleteConversation),
			Command.resolve(DeleteConversation, Message.DeletedConversation({ name: "c-other" })),
			Command.expectHas(LoadConversations),
			Command.resolve(LoadConversations, Message.LoadedConversations({ conversations: [] })),
		);
	});

	test("deleting the chat you are in starts a new one", () => {
		story(
			update,
			given(listed),
			message(Message.ClickedDeleteConversation({ name: "c-story" })),
			message(Message.ConfirmedDeleteConversation({ name: "c-story" })),
			Command.resolve(DeleteConversation, Message.DeletedConversation({ name: "c-story" })),
			Command.expectHas(StartNewConversation),
			Command.resolve(StartNewConversation, Message.CompletedNavigation()),
		);
	});

	test("a reset already running ignores a second click", () => {
		const resetting = update(fresh, Message.ClickedResetApp());

		story(update, given(resetting.model), message(Message.ClickedResetApp()), Command.expectNone());
	});

	test("a sent message refreshes the chat list", () => {
		story(update, given(fresh), message(Message.SucceededSend()), Command.expectHas(LoadConversations), Command.resolve(LoadConversations, Message.LoadedConversations({ conversations: [] })));
	});
});


describe("basic: composer keys", () => {
	test("Enter sends, Shift+Enter breaks a line, IME Enter and phone Enter never send", () => {
		const desktop = { shiftKey: false, isComposing: false, isTouch: false };

		expect(decideComposerKey({ ...desktop, key: "Enter" })).toBe("send");
		expect(decideComposerKey({ ...desktop, key: "Enter", shiftKey: true })).toBe("newline");
		expect(decideComposerKey({ ...desktop, key: "Enter", isComposing: true })).toBe("ignore");
		expect(decideComposerKey({ ...desktop, key: "Enter", isTouch: true })).toBe("newline");
		expect(decideComposerKey({ ...desktop, key: "a" })).toBe("ignore");
	});
});

describe("basic: markdown", () => {
	test("fenced code, lists, headings, and inline marks parse without HTML", () => {
		const blocks = parseBlocks("# Title\n\nSome **bold** and `code`.\n\n- one\n- two\n\n```ts\nconst a = 1;\n```");

		expect(blocks.map((block) => block._tag)).toEqual(["Heading", "Paragraph", "List", "Code"]);
		const parts = parseInline("a [link](https://x.dev) and [bad](javascript:alert(1))");

		expect(parts.filter((part) => part._tag === "Link").map((part) => part.text)).toEqual(["link"]);
	});

	test("an unclosed fence while streaming still renders as code", () => {
		expect(parseBlocks("```js\nlet x")).toEqual([{ _tag: "Code", language: "js", code: "let x" }]);
	});
});

describe("basic: chat list", () => {
	test("chats group as Today, Yesterday, Last 7 days, Older", () => {
		const now = new Date(2026, 9, 13, 12).getTime();
		const hour = 3_600_000;

		expect([now - hour, now - 20 * hour, now - 3 * 24 * hour, now - 30 * 24 * hour].map((at) => dayGroup(now, at))).toEqual(["Today", "Yesterday", "Last 7 days", "Older"]);
	});
});

describe("basic: connection", () => {
	test("a socket that opens and closes without a snapshot still counts as a failure", () => {
		const flapping = Array.from({ length: 6 }).reduce<typeof offline>((current) => update(update(current, Message.SocketOpened()).model, Message.SocketClosed()).model, offline);

		expect(isOffline(flapping)).toBe(true);
	});

	test("after six failed connects the page says offline and stops trying until Retry", () => {
		const failing = Array.from({ length: 6 }).reduce<typeof offline>((current) => update(current, Message.SocketClosed()).model, offline);

		expect(isOffline(failing)).toBe(true);
		story(
			update,
			given(failing),
			message(Message.ClickedRetryConnection()),
			model((current) => {
				expect(isOffline(current)).toBe(false);
				expect(current.failedConnects).toBe(0);
			}),
		);
	});
});

describe("basic: loading", () => {
	test("an existing chat shows a loader, not the empty state, until its snapshot arrives", () => {
		const opening = initialModel({ name, isNew: false, now: 1_000 });

		expect(opening.loaded).toBe(false);
		expect(initialModel({ name, isNew: true, now: 1_000 }).loaded).toBe(true);
		story(
			update,
			given({ ...opening, connected: true }),
			message(frame(SnapshotFrame.make({ snapshot: snapshot({ blocks: [UserBlock.make({ text: "hi" })] }) }))),
			model((current) => {
				expect(current.loaded).toBe(true);
			}),
		);
	});
});

describe("who is signed in", () => {
	test("the header learns the signed-in email from the kernel", () => {
		story(
			update,
			given(offline),
			message(Message.LoadedIdentity({ email: "person@example.com" })),
			model((current) => {
				expect(current.email).toBe("person@example.com");
			}),
		);
	});
});

describe("phone navigation", () => {
	test("the chats menu opens from the header, and picking a chat closes it", () => {
		story(
			update,
			given(fresh),
			message(Message.ToggledMobileSheet({ sheet: "chats" })),
			model((current) => {
				expect(current.mobileSheet).toBe("chats");
			}),
			message(Message.ClickedConversation({ name: "c-story" })),
			model((current) => {
				expect(current.mobileSheet).toBe("none");
			}),
		);
	});

	test("only one sheet is open at a time, and tapping the same one closes it", () => {
		story(
			update,
			given(fresh),
			message(Message.ToggledMobileSheet({ sheet: "chats" })),
			message(Message.ToggledMobileSheet({ sheet: "files" })),
			model((current) => {
				expect(current.mobileSheet).toBe("files");
			}),
			message(Message.ToggledMobileSheet({ sheet: "files" })),
			model((current) => {
				expect(current.mobileSheet).toBe("none");
			}),
		);
	});
});

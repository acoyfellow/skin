import { Option } from "effect";
import type { Html, HtmlBuilder } from "foldkit/html";
import { Message } from "../message";
import type { Model } from "../model";

type H = HtmlBuilder<Message>;

const MINUTE = 60_000;

const HOUR = 60 * MINUTE;

const DAY = 24 * HOUR;

export const ago = (now: number, at: number): string => {
	const elapsed = Math.max(0, now - at);

	if (elapsed < MINUTE) return "just now";

	if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;

	if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} h ago`;

	return `${Math.floor(elapsed / DAY)} d ago`;
};

type Conversation = Model["conversations"][number];

const STATE_DOT: Readonly<Record<Conversation["state"], string>> = {
	working: "bg-life animate-pulse",
	idle: "bg-ok",
	failed: "bg-bad",
};

const STATE_LABEL: Readonly<Record<Conversation["state"], string>> = {
	working: "working",
	idle: "idle",
	failed: "stopped with an error",
};

const stateOf = (model: Model, conversation: Conversation): Conversation["state"] => (conversation.name === model.name && model.busy ? "working" : conversation.state);

const confirmRow = (h: H, conversation: Conversation): Html =>
	h.li(
		[h.Class("grid gap-2 rounded-md border border-bad-line bg-bad-soft px-2.5 py-2 text-[12px]"), h.DataAttribute("conversation", conversation.name), h.Role("alertdialog"), h.AriaLabel("Confirm delete")],
		[
			h.p([h.Class("text-ink")], [`Delete "${conversation.title === "" ? "Untitled chat" : conversation.title}"? Its agent forgets it. Your app is not changed.`]),
			h.div(
				[h.Class("flex gap-2")],
				[
					h.button([h.Type("button"), h.Class("rounded bg-bad px-2 py-0.5 font-medium text-white"), h.OnClick(Message.ConfirmedDeleteConversation({ name: conversation.name }))], ["Delete"]),
					h.button([h.Type("button"), h.Class("rounded border border-line-strong px-2 py-0.5"), h.OnClick(Message.CancelledDeleteConversation())], ["Keep"]),
				],
			),
		],
	);

const row = (h: H, model: Model, conversation: Conversation): Html => {
	if (Option.contains(model.confirmingDelete, conversation.name)) return confirmRow(h, conversation);

	const current = conversation.name === model.name;
	const state = stateOf(model, conversation);

	return h.li(
		[h.Class(`group flex items-center gap-1 rounded-md ${current ? "bg-raised" : "hover:bg-raised"}`), h.DataAttribute("conversation", conversation.name), h.DataAttribute("state", state)],
		[
			h.button(
				[h.Type("button"), h.Class("min-w-0 flex-1 px-2.5 py-2 text-left"), h.AriaCurrent(current ? "page" : "false"), h.OnClick(Message.ClickedConversation({ name: conversation.name }))],
				[
					h.span(
						[h.Class("flex items-center gap-2")],
						[
							h.i([h.Class(`inline-block size-2 flex-none rounded-full ${STATE_DOT[state]}`), h.Title(STATE_LABEL[state]), h.Role("status"), h.AriaLabel(STATE_LABEL[state])], []),
							h.span([h.Class(`truncate text-[13px] ${current ? "font-medium" : ""}`)], [conversation.title === "" ? "Untitled chat" : conversation.title]),
						],
					),
					h.span([h.Class("block pl-4 text-[11px] text-faint")], [state === "working" ? `working · started ${ago(model.now, conversation.updatedAt)}` : ago(model.now, conversation.updatedAt)]),
				],
			),
			h.button(
				[
					h.Type("button"),
					h.Class("mr-1 rounded px-1.5 text-[13px] text-faint opacity-0 group-hover:opacity-100 hover:text-bad focus:opacity-100"),
					h.AriaLabel(`Delete the chat "${conversation.title}"`),
					h.Title("Delete this chat"),
					h.OnClick(Message.ClickedDeleteConversation({ name: conversation.name })),
				],
				["×"],
			),
		],
	);
};

export const dayGroup = (now: number, at: number): string => {
	const startOfToday = new Date(now);

	startOfToday.setHours(0, 0, 0, 0);

	const today = startOfToday.getTime();

	if (at >= today) return "Today";

	if (at >= today - DAY) return "Yesterday";

	if (at >= today - 6 * DAY) return "Last 7 days";

	return "Older";
};

const GROUP_ORDER = ["Today", "Yesterday", "Last 7 days", "Older"];

const matchesSearch = (search: string, conversation: Conversation): boolean => search.trim() === "" || conversation.title.toLowerCase().includes(search.trim().toLowerCase());

const groupedRows = (h: H, model: Model): ReadonlyArray<Html> => {
	const visible = model.conversations.filter((conversation) => matchesSearch(model.chatSearch, conversation));

	if (model.conversations.length === 0) return [h.li([h.Class("px-2.5 py-2 text-[13px] text-faint")], ["Your chats appear here after the first message."])];

	if (visible.length === 0) return [h.li([h.Class("px-2.5 py-2 text-[13px] text-faint")], ["No chat matches."])];

	return GROUP_ORDER.flatMap((group) => {
		const rows = visible.filter((conversation) => dayGroup(model.now, conversation.updatedAt) === group);

		return rows.length === 0 ? [] : [h.li([h.Class("px-2.5 pt-3 pb-1 text-[11px] font-medium tracking-wide text-faint uppercase")], [group]), ...rows.map((conversation) => row(h, model, conversation))];
	});
};

export const chatsPanel = (h: H, model: Model): Html =>
	h.nav(
		[h.Id("panel-chats"), h.Class(`panel-chats ${model.mobileSheet === "chats" ? "fixed inset-y-0 top-12 left-0 z-30 flex w-[min(320px,86vw)] pb-[env(safe-area-inset-bottom)] shadow-xl" : "hidden"} min-h-0 min-w-0 flex-col overflow-hidden border-r border-line bg-panel md:static md:z-auto md:flex md:w-auto md:shadow-none`), h.AriaLabel("Chats")],
		[
			h.div(
				[h.Class("grid gap-2 p-3")],
				[
					h.button(
						[h.Type("button"), h.Class("h-9 w-full rounded-md border border-line-strong bg-bg text-[13px] font-medium hover:bg-raised"), h.OnClick(Message.ClickedNew())],
						["New chat"],
					),
					h.input([
						h.Type("search"),
						h.Class("h-9 w-full rounded-md border border-line bg-bg px-2.5 text-[16px] placeholder:text-faint md:h-8 md:text-[13px]"),
						h.Placeholder("Search chats"),
						h.AriaLabel("Search chats"),
						h.Value(model.chatSearch),
						h.OnInput((value) => Message.UpdatedChatSearch({ value })),
					]),
				],
			),
			...Option.match(model.conversationsError, { onNone: () => [], onSome: (reason) => [h.p([h.Class("px-4 py-1 text-[12px] text-bad")], [reason])] }),
			h.ul([h.Class("min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain px-2 pb-3")], groupedRows(h, model)),
			h.div(
				[h.Class("grid gap-1 border-t border-line p-2 md:hidden")],
				[
					h.a([h.Href("/?settings=open"), h.DataAttribute("command-center", "open"), h.Class("flex h-10 items-center rounded-md px-3 text-[14px] hover:bg-raised")], ["Settings"]),
					h.form([h.Method("post"), h.Action("/oauth/logout")], [h.button([h.Type("submit"), h.Class("flex h-10 w-full items-center rounded-md px-3 text-left text-[14px] text-dim hover:bg-raised")], [model.email === "" ? "Sign out" : `Sign out ${model.email}`])]),
				],
			),
		],
	);

export const sheetBackdrop = (h: H, model: Model): ReadonlyArray<Html> =>
	model.mobileSheet === "none" ? [] : [h.div([h.Class("fixed inset-0 top-12 z-20 bg-black/40 md:hidden"), h.AriaHidden(true), h.OnClick(Message.ClosedMobileSheet())], [])];

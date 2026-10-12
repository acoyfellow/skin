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

const row = (h: H, model: Model, conversation: Model["conversations"][number]): Html => {
	const current = conversation.name === model.name;

	return h.li(
		[h.Class(`group flex items-center gap-1 rounded-md ${current ? "bg-raised" : "hover:bg-raised"}`), h.DataAttribute("conversation", conversation.name)],
		[
			h.button(
				[h.Type("button"), h.Class("min-w-0 flex-1 px-2.5 py-2 text-left"), h.AriaCurrent(current ? "page" : "false"), h.OnClick(Message.ClickedConversation({ name: conversation.name }))],
				[
					h.span([h.Class(`block truncate text-[13px] ${current ? "font-medium" : ""}`)], [conversation.title === "" ? "Untitled chat" : conversation.title]),
					h.span([h.Class("block text-[11px] text-faint")], [ago(model.now, conversation.updatedAt)]),
				],
			),
			h.button(
				[
					h.Type("button"),
					h.Class("mr-1 rounded px-1.5 text-[13px] text-faint opacity-0 group-hover:opacity-100 hover:text-bad focus:opacity-100"),
					h.AriaLabel(`Delete the chat "${conversation.title}"`),
					h.Title("Delete this chat and everything its agent remembers from it. Your app is not changed."),
					h.OnClick(Message.ClickedDeleteConversation({ name: conversation.name })),
				],
				["×"],
			),
		],
	);
};

export const chatsPanel = (h: H, model: Model): Html =>
	h.nav(
		[h.Class("hidden min-h-0 flex-col border-r border-line bg-panel md:flex"), h.AriaLabel("Chats")],
		[
			h.div(
				[h.Class("p-3")],
				[
					h.button(
						[h.Type("button"), h.Class("h-9 w-full rounded-md border border-line-strong bg-bg text-[13px] font-medium hover:bg-raised"), h.OnClick(Message.ClickedNew())],
						["New chat"],
					),
				],
			),
			h.p([h.Class("px-4 pb-1 text-[11px] font-medium tracking-wide text-faint uppercase")], ["Chats"]),
			...Option.match(model.conversationsError, { onNone: () => [], onSome: (reason) => [h.p([h.Class("px-4 py-1 text-[12px] text-bad")], [reason])] }),
			h.ul(
				[h.Class("min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3")],
				model.conversations.length === 0 ? [h.li([h.Class("px-2.5 py-2 text-[13px] text-faint")], ["Your chats appear here after the first message."])] : model.conversations.map((conversation) => row(h, model, conversation)),
			),
		],
	);

import { Option } from "effect";
import type { Document, Html, HtmlBuilder } from "foldkit/html";
import { Message } from "../message";
import { type Model, Phase } from "../model";
import { activityRow, clock, elapsedSeconds, turnSeconds } from "./activity";
import { chatsPanel, sheetBackdrop } from "./chats";
import { fileViewer, filesPanel } from "./files";
import { transcript } from "./transcript";
import { ComposerKeys } from "../composer";
import { FollowLog } from "../follow";
import { isOffline } from "../socket";
import type { Edge } from "../layout";

type H = HtmlBuilder<Message>;

type Status = { readonly label: string; readonly tone: string; readonly mark: string };

const statusOf = (model: Model): Status =>
	isOffline(model)
		? { label: "Offline", tone: "text-bad", mark: "bg-bad" }
		: Phase.match(model.phase, {
				Connecting: () => ({ label: "Connecting", tone: "text-faint", mark: "bg-faint" }),
				Idle: () => ({ label: "Idle", tone: "text-dim", mark: "bg-ok" }),
				Working: () => ({ label: "Working", tone: "text-ink", mark: "bg-ink" }),
				Dead: () => ({ label: "Killed", tone: "text-bad", mark: "bg-bad" }),
				Reviving: () => ({ label: "Coming back", tone: "text-life", mark: "bg-life" }),
			});

const isDown = (model: Model): boolean => Phase.isAnyOf(["Dead", "Reviving"])(model.phase);

const BUTTON = "h-8 rounded-md px-3 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";

const divider = (h: H): Html => h.span([h.Class("h-4 w-px bg-line-strong"), h.AriaHidden(true)], []);

const PANEL_ICON: Readonly<Record<Edge, string>> = {
	chats: "M3 4h18v16H3zM9 4v16",
	files: "M3 4h18v16H3zM15 4v16",
};

const PANEL_NAME: Readonly<Record<Edge, string>> = {
	chats: "Show or hide chats",
	files: "Show or hide files and versions",
};

const PANEL_SHORTCUT: Readonly<Record<Edge, string>> = { chats: "⌘B", files: "⌘J" };

const panelToggle = (h: H, edge: Edge): Html =>
	h.button(
		[
			h.Type("button"),
			h.Id(`toggle-${edge}`),
			h.Class("hidden size-8 items-center justify-center rounded-md text-dim hover:bg-raised hover:text-ink md:inline-flex"),
			h.DataAttribute("panel-toggle", edge),
			h.AriaLabel(PANEL_NAME[edge]),
			h.AriaControls(`panel-${edge}`),
			h.AriaExpanded(true),
			h.Title(`${PANEL_NAME[edge]} (${PANEL_SHORTCUT[edge]})`),
		],
		[
			h.svg(
				[h.ViewBox("0 0 24 24"), h.Class("size-4"), h.Fill("none"), h.Stroke("currentColor"), h.StrokeWidth("1.75"), h.AriaHidden(true)],
				[h.path([h.D(PANEL_ICON[edge]), h.StrokeLinejoin("round")], [])],
			),
		],
	);

const resizeHandle = (h: H, edge: Edge): Html =>
	h.div(
		[
			h.Id(`resize-${edge}`),
			h.Class(`panel-resize panel-resize-${edge}`),
			h.DataAttribute("panel-resize", edge),
			h.Role("separator"),
			h.AriaOrientation("vertical"),
			h.AriaLabel(edge === "chats" ? "Resize chats" : "Resize files and versions"),
			h.AriaControls(`panel-${edge}`),
			h.Tabindex(0),
			h.Title("Drag to resize. Double click to reset."),
		],
		[],
	);

const signOut = (h: H, model: Model): Html =>
	h.form(
		[h.Id("sign-out"), h.Method("post"), h.Action("/oauth/logout"), h.Class("flex items-center gap-2")],
		[
			...(model.email === "" ? [] : [h.span([h.Id("signed-in-as"), h.Class("hidden max-w-[200px] truncate text-[12px] text-faint lg:inline"), h.Title(`Signed in as ${model.email}`)], [model.email])]),
			h.button([h.Type("submit"), h.Class("rounded border border-line-strong px-2 py-0.5 text-[12px] hover:bg-raised"), h.Title(model.email === "" ? "Sign out" : `Sign out ${model.email}`)], ["Sign out"]),
		],
	);

const header = (h: H, model: Model): Html => {
	const status = statusOf(model);

	return h.header(
		[h.Class("flex h-12 items-center gap-2 border-b border-line pr-2 pl-1 pt-[env(safe-area-inset-top)] box-content md:h-14 md:gap-3 md:px-5 md:pt-0")],
		[
			h.button(
				[
					h.Type("button"),
					h.Id("open-chats"),
					h.Class("inline-flex size-10 items-center justify-center rounded-md text-ink hover:bg-raised md:hidden"),
					h.AriaLabel(model.mobileSheet === "chats" ? "Close chats" : "Open chats"),
					h.AriaExpanded(model.mobileSheet === "chats"),
					h.AriaControls("panel-chats"),
					h.OnClick(Message.ToggledMobileSheet({ sheet: "chats" })),
				],
				[h.span([h.Class("grid gap-[4px]"), h.AriaHidden(true)], [h.i([h.Class("block h-[1.5px] w-[18px] rounded bg-current")], []), h.i([h.Class("block h-[1.5px] w-[18px] rounded bg-current")], []), h.i([h.Class("block h-[1.5px] w-[12px] rounded bg-current")], [])])],
			),
			h.img([h.Src("/_kernel/icon.png"), h.Alt(""), h.Width("26"), h.Height("26"), h.Class("hidden rounded-md md:block")]),
			h.h1([h.Class("min-w-0 truncate text-[15px] font-semibold tracking-[-0.01em]")], ["skin"]),
			h.div(
				[h.Class("ml-auto flex flex-none items-center gap-1 md:gap-4")],
				[
					h.span(
						[h.Id("status"), h.Class(`flex items-center gap-2 px-2 text-[13px] ${status.tone}`), h.AriaLive("polite"), h.Title(status.label)],
						[h.i([h.Class(`size-2 rounded-full ${status.mark}`), h.AriaHidden(true)], []), h.span([h.Class("hidden sm:inline")], [status.label])],
					),
					...(isOffline(model)
						? [h.button([h.Type("button"), h.Id("retry-connection"), h.Class("rounded border border-line-strong px-2 py-0.5 text-[12px] hover:bg-raised"), h.OnClick(Message.ClickedRetryConnection())], ["Retry"])]
						: []),
					h.span([h.Class("hidden md:block")], [divider(h)]),
					h.div(
						[h.Class("flex items-center gap-1 md:gap-2")],
						[
							panelToggle(h, "chats"),
							panelToggle(h, "files"),
							h.button(
								[h.Type("button"), h.Id("open-files"), h.Class(`h-9 rounded-md px-3 text-[13px] md:hidden ${model.mobileSheet === "files" ? "bg-raised text-ink" : "text-dim hover:bg-raised"}`), h.AriaExpanded(model.mobileSheet === "files"), h.AriaControls("panel-files"), h.OnClick(Message.ToggledMobileSheet({ sheet: "files" }))],
								["Versions"],
							),
							h.button(
								[h.Type("button"), h.Id("mobile-new-chat"), h.Class("inline-flex size-10 items-center justify-center rounded-md text-[22px] leading-none text-ink hover:bg-raised md:hidden"), h.AriaLabel("New chat"), h.OnClick(Message.ClickedNew())],
								["+"],
							),
							h.a(
								[h.Id("model-settings"), h.Href("/?settings=open"), h.DataAttribute("command-center", "open"), h.AriaHasPopup("dialog"), h.Title("Settings (⌘K)"), h.Class("hidden items-center gap-1.5 rounded border border-line-strong px-2 py-0.5 text-[12px] hover:bg-raised md:flex")],
								["Settings", h.kbd([h.Class("hidden font-mono text-[11px] text-faint sm:inline")], ["⌘K"])],
							),
							h.span([h.Class("hidden md:block")], [signOut(h, model)]),
						],
					),
				],
			),
		],
	);
};

const activity = (h: H, model: Model): Html => {
	const row = activityRow(model);

	return h.div(
		[
			h.Id("activity"),
			h.Hidden(!row.visible),
			h.Class(`mx-auto mb-2 flex w-full max-w-[720px] items-center gap-2 text-[13px] ${row.dead ? "text-bad" : "text-dim"}`),
			h.AriaLive("polite"),
		],
		[
			h.span([h.Class(`size-3 rounded-full border-[1.5px] ${row.dead ? "border-bad" : "animate-spin border-line-strong border-t-ink"}`), h.AriaHidden(true)], []),
			h.span([], [row.label]),
			h.span([h.Class("ml-auto font-mono text-[12px] text-faint"), h.Title("This step")], [clock(elapsedSeconds(model))]),
			...Option.match(turnSeconds(model), {
				onNone: () => [],
				onSome: (seconds) => [h.span([h.Id("turn-timer"), h.Class("font-mono text-[12px] text-ink"), h.Title("Whole task so far")], [`task ${clock(seconds)}`])],
			}),
		],
	);
};

const composer = (h: H, model: Model): Html =>
	h.form(
		[h.Class("mx-auto w-full max-w-[720px]"), h.OnSubmit(Message.SubmittedDraft())],
		[
			h.label([h.For("task"), h.Class("sr-only")], ["Task for the agent"]),
			h.div(
				[h.Class("flex items-end gap-2 rounded-lg border border-line-strong bg-bg p-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] focus-within:border-ink")],
				[
					h.textarea([
						h.Id("task"),
						h.Rows(1),
						h.Placeholder("Describe a task that takes a few steps"),
						h.Value(model.draft),
						h.Class("min-h-9 flex-1 resize-none overflow-y-auto bg-transparent px-2.5 py-1.5 text-[16px] outline-none md:text-[14px] placeholder:text-faint focus-visible:outline-none"),
						h.AriaLabel("Message"),
						h.OnInput((value) => Message.UpdatedDraft({ value })),
						h.OnMount(ComposerKeys()),
					]),
					model.busy
						? h.button(
								[
									h.Type("button"),
									h.Id("stop"),
									h.Disabled(model.stopping),
									h.AriaLabel("Stop the agent"),
									h.Title("Stop (Esc)"),
									h.Class(`${BUTTON} h-9 border border-line-strong bg-bg text-ink hover:bg-raised`),
									h.OnClick(Message.ClickedStop()),
								],
								[model.stopping ? "Stopping…" : "Stop"],
							)
						: h.button(
								[
									h.Type("submit"),
									h.Id("send"),
									h.Disabled(model.draft.trim() === "" || isDown(model)),
									h.AriaLabel(model.draft.trim() === "" ? "Message requires text" : "Send message"),
									h.Class(`${BUTTON} h-9 bg-accent text-accent-ink hover:opacity-90`),
								],
								["Send"],
							),
				],
			),
			h.p(
				[h.Class("mt-2 text-[12px] text-faint")],
				model.busy
					? [h.kbd([h.Class("font-mono")], ["Esc"]), " stops the agent. You can write your next message now."]
					: [h.kbd([h.Class("font-mono")], ["Enter"]), " sends. ", h.kbd([h.Class("font-mono")], ["Shift Enter"]), " adds a line."],
			),
		],
	);

const unseenCount = (model: Model): number => Option.match(model.unseenFrom, { onNone: () => 0, onSome: (from) => Math.max(0, model.blocks.length - from) });

const jumpButton = (h: H, model: Model): ReadonlyArray<Html> => {
	if (model.following) return [];

	const unseen = unseenCount(model);

	return [
		h.button(
			[
				h.Type("button"),
				h.Id("jump-to-latest"),
				h.Class("absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-line-strong bg-bg px-3 py-1 text-[12px] font-medium shadow-sm hover:bg-raised"),
				h.AriaLabel("Scroll to latest message"),
				h.OnClick(Message.ClickedJumpToLatest()),
			],
			[unseen === 0 ? "↓ Latest" : `↓ ${unseen} new`],
		),
	];
};

const conversation = (h: H, model: Model): Html =>
	h.section(
		[h.Class("grid min-h-0 min-w-0 grid-rows-[1fr_auto] overflow-hidden"), h.AriaLabel("Conversation")],
		[
			h.div([h.Class("relative min-h-0")], [
				h.div([h.Id("log"), h.Class("@container h-full overflow-x-hidden overflow-y-auto overscroll-contain px-4 pt-5 pb-4 md:px-5 md:pt-8 [overflow-wrap:anywhere]"), h.Role("log"), h.AriaLive("polite"), h.AriaLabel("Conversation"), h.OnMount(FollowLog())], [transcript(h, model)]),
				...jumpButton(h, model),
			]),
			h.div([h.Class("px-3 pb-[max(12px,env(safe-area-inset-bottom))] md:px-5 md:pb-5")], [activity(h, model), composer(h, model)]),
		],
	);

export const view = (model: Model, h: H): Document => ({
	title: Option.match(turnSeconds(model), { onNone: () => "skin", onSome: (seconds) => `skin · working ${clock(seconds)}` }),
	body: h.div(
		[h.Class("grid h-[100dvh] grid-rows-[auto_1fr] overflow-hidden")],
		[
			header(h, model),
			...sheetBackdrop(h, model),
			h.main(
				[h.Class("panels relative grid min-h-0 grid-cols-1 md:grid-cols-[var(--chats-w,220px)_minmax(0,1fr)_var(--files-w,340px)]")],
				[
					chatsPanel(h, model),
					resizeHandle(h, "chats"),
					Option.getOrElse(fileViewer(h, model), () => conversation(h, model)),
					resizeHandle(h, "files"),
					filesPanel(h, model),
				],
			),
		],
	),
});

import { Array as Arr, Match, Option } from "effect";
import type { Html, HtmlBuilder } from "foldkit/html";
import type { Block, TimelineEvent, ToolBlock } from "../kernel/protocol";
import { Message } from "../message";
import { EXAMPLES, type LocalNote, type Model } from "../model";
import { markdown } from "./markdown";

type H = HtmlBuilder<Message>;

const LIVE_THOUGHT_TAIL = 700;

const tail = (text: string, size: number): string => (text.length > size ? `…${text.slice(-size)}` : text);

export const kilobytes = (size: number): string => (size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`);

const userTurn = (h: H, text: string): Html =>
	h.div(
		[h.Class("flex justify-end")],
		[h.div([h.Class("max-w-[85%] rounded-lg bg-raised px-3.5 py-2 whitespace-pre-wrap")], [text])],
	);

const reply = (h: H, model: Model, text: string, key: string, live: boolean): Html =>
	h.div(
		[h.Class("group grid gap-1"), h.DataAttribute("reply", key)],
		[
			markdown(h, text, model.copiedKey, key),
			...(live
				? []
				: [
						h.div(
							[h.Class("flex gap-2 text-[12px] text-faint opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100")],
							[
								h.button(
									[h.Type("button"), h.Class("rounded px-1.5 hover:text-ink"), h.AriaLabel("Copy message"), h.OnClick(Message.ClickedCopy({ key: `${key}.message`, text }))],
									[model.copiedKey === `${key}.message` ? "Copied" : "Copy"],
								),
							],
						),
					]),
		],
	);

const thought = (h: H, model: Model, key: string, text: string, live: boolean): Html => {
	const open = model.openThoughts.includes(key);

	return h.div(
		[h.Class("text-[13px] text-faint")],
		[
			h.button(
				[h.Type("button"), h.Class("hover:text-ink"), h.AriaExpanded(open), h.OnClick(Message.ToggledThought({ key }))],
				[live ? (open ? "Thinking · hide" : "Thinking…") : open ? "Hide thinking" : "Thinking"],
			),
			...(open ? [h.pre([h.Class("mt-1.5 border-l border-line-strong pl-3 font-mono text-[12px] whitespace-pre-wrap text-dim")], [live ? tail(text, LIVE_THOUGHT_TAIL) : text])] : []),
		],
	);
};

const toolDot = (block: ToolBlock, live: boolean): string =>
	Option.match(block.result, {
		onNone: () => (live ? "bg-ink" : "bg-line-strong"),
		onSome: ({ isError }) => (isError ? "bg-bad" : "bg-ok"),
	});

const pendingOutcome = (block: ToolBlock, live: boolean): string => {
	if (!live) return "Cut off by a kill. Ran again.";

	return block.draft === "" ? "…" : kilobytes(block.draft.length);
};

const toolRow = (h: H, block: ToolBlock, live: boolean): Html => {
	const outcome = Option.match(block.result, {
		onNone: () => pendingOutcome(block, live),
		onSome: ({ line }) => line,
	});

	return h.div(
		[h.Class("grid grid-cols-[auto_auto_minmax(0,1fr)_minmax(0,45%)] items-baseline gap-x-2 text-[13px]")],
		[
			h.i([h.Class(`inline-block size-1.5 translate-y-[-1px] rounded-full ${toolDot(block, live)}`), h.AriaHidden(true)], []),
			h.span([h.Class("font-mono text-[12px] text-ink")], [block.name]),
			h.span([h.Class("truncate font-mono text-[12px] text-faint")], [block.path]),
			h.span([h.Class("truncate text-right text-faint"), h.Title(outcome)], [outcome]),
		],
	);
};

const blockView = (h: H, model: Model, block: Block, key: string, live: boolean): Html =>
	Match.value(block).pipe(
		Match.tagsExhaustive({
			UserText: ({ text }) => userTurn(h, text),
			Reply: ({ text }) => reply(h, model, text, key, live),
			Thought: ({ text }) => thought(h, model, key, text, live),
			Tool: (tool) => toolRow(h, tool, live),
		}),
	);

const seconds = (ms: number): string => (ms / 1000).toFixed(1);

const note = (h: H, tone: string, label: string, text: string): Html =>
	h.div(
		[h.Class(`flex gap-3 border-l-2 py-0.5 pl-3 text-[13px] ${tone}`), h.Role("status")],
		[h.span([h.Class("font-medium")], [label]), h.span([h.Class("text-dim")], [text])],
	);

const eventView = (h: H, event: TimelineEvent): Html =>
	Match.value(event).pipe(
		Match.tagsExhaustive({
			Killed: ({ wasBusy }) => note(h, "border-bad text-bad", "Killed", `The Durable Object was aborted${wasBusy ? " in the middle of the task." : "."}`),
			Back: ({ afterMs, lives, resumed }) =>
				note(h, "border-life text-life", `Back after ${seconds(afterMs)}s`, resumed ? `Life ${lives}. Resuming from the last checkpoint.` : "Nothing was running, so there was nothing to resume."),
			Resumed: ({ lives }) => note(h, "border-life text-life", "Restarted", `Life ${lives}. The object stopped without a kill, for example a deploy, and picked the task back up.`),
			Failed: ({ reason }) => note(h, "border-bad text-bad", "Failed", reason),
		}),
	);

const noteView = (h: H, local: LocalNote): Html => note(h, "border-bad text-bad", "Not sent", local.reason);

type Placed = { readonly afterBlock: number; readonly at: number; readonly html: Html };

const timeline = (h: H, model: Model): ReadonlyArray<Placed> =>
	[
		...model.events.map((event) => ({ afterBlock: event.afterBlock, at: event.at, html: eventView(h, event) })),
		...model.localNotes.map((local) => ({ afterBlock: local.afterBlock, at: local.at, html: noteView(h, local) })),
	].toSorted((a, b) => a.afterBlock - b.afterBlock || a.at - b.at);

const steps: ReadonlyArray<readonly [string, string]> = [
	["Ask for a change.", "Anything you see: a new feature, a different layout, a different look. This chat is part of the app too."],
	["Your agent rewrites the app.", "It edits the code and builds a new version while you keep using this one."],
	["It only goes live if it works.", "Each new version is tested first. If it fails, you keep the current one. Every earlier version stays under Versions, so you can always go back."],
];

const emptyState = (h: H): Html =>
	h.div(
		[h.Class("mx-auto grid max-w-[720px] gap-10")],
		[
			h.div(
				[h.Class("grid items-center gap-6 sm:grid-cols-[minmax(0,1fr)_200px]")],
				[
					h.div(
						[h.Class("grid gap-3")],
						[
							h.h2(
								[h.Class("text-[34px] leading-[1.1] font-semibold tracking-[-0.03em]")],
								["This is your own skin. ", h.span([h.Class("text-life")], ["Change anything."])],
							),
							h.p(
								[h.Class("max-w-[52ch] text-[16px] text-dim")],
								[
									"Nobody else sees your copy. Tell your agent what you want, and it reshapes the app around you.",
								],
							),
						],
					),
					h.img([h.Src("/_kernel/hero.png"), h.Alt(""), h.Class("hidden aspect-square w-full rounded-xl object-cover sm:block")]),
				],
			),
			h.ol(
				[h.Class("grid gap-5 border-t border-line pt-6 lg:grid-cols-3")],
				steps.map(([lead, detail], index) =>
					h.li(
						[h.Class("grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 lg:grid-cols-1 lg:gap-y-2")],
						[
							h.span([h.Class(`font-mono text-[13px] ${index === 2 ? "text-life" : "text-faint"}`)], [`0${index + 1}`]),
							h.div([h.Class("grid gap-0.5")], [h.span([h.Class("font-medium")], [lead]), h.span([h.Class("text-[13px] text-dim")], [detail])]),
						],
					),
				),
			),
			h.div(
				[h.Class("grid gap-2")],
				[
					h.h3([h.Class("text-[13px] text-faint")], ["Try one of these"]),
					h.div(
						[h.Class("grid divide-y divide-line rounded-lg border border-line")],
						EXAMPLES.map((example) =>
							h.button(
								[h.Type("button"), h.Class("group flex items-center justify-between gap-4 px-4 py-3 text-left hover:bg-panel"), h.OnClick(Message.ClickedExample({ text: example }))],
								[example, h.span([h.Class("text-faint group-hover:text-ink"), h.AriaHidden(true)], ["→"])],
							),
						),
					),
					h.p(
						[h.Class("text-[12px] text-faint")],
						["If the agent is interrupted mid-task, by a deploy or anything else, it comes back and finishes."],
					),
				],
			),
		],
	);

export const transcript = (h: H, model: Model): Html => {
	const liveBlocks = Option.match(model.live, { onNone: () => [], onSome: (live) => live.blocks });

	const placed = timeline(h, model);

	if (Arr.isReadonlyArrayEmpty(model.blocks) && Arr.isReadonlyArrayEmpty(placed) && Arr.isReadonlyArrayEmpty(liveBlocks)) return emptyState(h);

	const settled = model.blocks.flatMap((block, index) => [
		...placed.filter((item) => item.afterBlock === index).map((item) => item.html),
		blockView(h, model, block, String(index), false),
	]);

	const trailing = placed.filter((item) => item.afterBlock >= model.blocks.length).map((item) => item.html);
	const streaming = liveBlocks.map((block, index) => blockView(h, model, block, `live.${index}`, true));

	return h.div([h.Class("mx-auto flex max-w-[720px] flex-col gap-4")], [...settled, ...trailing, ...streaming]);
};

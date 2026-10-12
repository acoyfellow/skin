import { Array as Arr, Option, Predicate } from "effect";
import type { Html, HtmlBuilder } from "foldkit/html";
import type { ToolBlock } from "../kernel/protocol";
import { Message } from "../message";
import { type Model, OpenFile } from "../model";
import { kilobytes } from "./transcript";

type H = HtmlBuilder<Message>;

const LIVE_FILE_TAIL = 1800;

const heading = (h: H, label: string, aside: string): Html =>
	h.div(
		[h.Class("flex items-baseline justify-between px-4 pt-6 pb-2")],
		[h.h2([h.Class("text-[13px] font-semibold")], [label]), h.span([h.Class("text-[12px] text-faint")], [aside])],
	);

const writingNow = (model: Model): Option.Option<ToolBlock> =>
	Option.flatMap(model.live, (live) =>
		Option.filter(Option.fromNullishOr(live.blocks.at(-1)), (block): block is ToolBlock => Predicate.isTagged(block, "Tool") && block.name === "write_file" && Option.isNone(block.result)),
	);

const liveFile = (h: H, block: ToolBlock): Html =>
	h.div(
		[h.Class("mx-3 mb-2 overflow-hidden rounded-md border border-line-strong bg-bg")],
		[
			h.div(
				[h.Class("flex items-center gap-2 border-b border-line px-3 py-2 text-[12px]")],
				[
					h.span([h.Class("size-2.5 animate-spin rounded-full border-[1.5px] border-line-strong border-t-ink"), h.AriaHidden(true)], []),
					h.span([h.Class("font-mono")], [block.path === "" ? "file" : block.path]),
					h.span([h.Class("text-faint")], ["writing"]),
					h.span([h.Class("ml-auto text-faint")], [kilobytes(block.draft.length)]),
				],
			),
			h.pre([h.Class("max-h-64 overflow-auto p-3 font-mono text-[12px] whitespace-pre-wrap text-dim")], [block.draft.slice(-LIVE_FILE_TAIL)]),
		],
	);

const viewerBody = (model: Model, path: string): Option.Option<string> =>
	OpenFile.match(model.openFile, {
		Closed: () => Option.none(),
		Loading: (open) => (open.path === path ? Option.some("loading…") : Option.none()),
		Loaded: (open) => (open.path === path ? Option.some(open.body) : Option.none()),
	});

const fileRow = (h: H, model: Model, path: string): ReadonlyArray<Html> => {
	const body = viewerBody(model, path);

	return [
		h.button(
			[
				h.Type("button"),
				h.Class(`block w-full truncate px-4 py-1.5 text-left font-mono text-[12px] hover:bg-raised ${Option.isSome(body) ? "bg-raised font-medium" : ""}`),
				h.AriaExpanded(Option.isSome(body)),
				h.OnClick(Message.ClickedFile({ path })),
			],
			[path],
		),
		...Option.match(body, {
			onNone: () => [],
			onSome: (text) => [h.pre([h.Class("mx-3 my-1 max-h-80 overflow-auto rounded-md border border-line bg-bg p-3 font-mono text-[12px] whitespace-pre-wrap text-dim")], [text])],
		}),
	];
};

type GenerationRow = Model["body"]["generations"][number];

const STATUS_TONE: Readonly<Record<GenerationRow["status"], string>> = {
	building: "text-life",
	rejected: "text-bad",
	ready: "text-dim",
	live: "text-ok",
	retired: "text-faint",
};

const failedChecks = (generation: GenerationRow): string =>
	generation.checks
		.filter((check) => !check.ok)
		.map((check) => `${check.name}: ${check.detail}`)
		.join("\n");

const generationRow = (h: H, generation: GenerationRow): Html =>
	h.div(
		[h.Class("px-4 py-1.5 text-[13px]"), h.DataAttribute("generation", String(generation.id)), h.DataAttribute("status", generation.status)],
		[
			h.div(
				[h.Class("grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-3")],
				[
					h.code([h.Class("font-mono text-[12px] text-faint")], [`#${generation.id}`]),
					h.span([h.Class("truncate")], [generation.message]),
					generation.status === "retired"
						? h.button(
								[h.Type("button"), h.Class("rounded border border-line-strong px-1.5 text-[12px] hover:bg-raised"), h.OnClick(Message.ClickedRollback({ generation: generation.id }))],
								["Roll back"],
							)
						: h.span([h.Class(`font-mono text-[12px] ${STATUS_TONE[generation.status]}`)], [generation.status]),
				],
			),
			...(generation.status === "rejected" ? [h.pre([h.Class("mt-1 max-h-32 overflow-auto font-mono text-[11px] whitespace-pre-wrap text-bad")], [generation.note === "" ? failedChecks(generation) : generation.note])] : []),
		],
	);

const none = (h: H, text: string): Html => h.div([h.Class("px-4 py-1.5 text-[13px] text-faint")], [text]);

export const filesPanel = (h: H, model: Model): Html => {
	const writing = writingNow(model);
	const generationCount = model.body.generations.length;

	return h.aside(
		[
			h.Class(
				`${model.filesPanelOpen ? "fixed inset-0 top-14 z-10 block" : "hidden"} overflow-y-auto border-l border-line bg-panel md:static md:block`,
			),
			h.AriaLabel("Source and generations"),
		],
		[
			heading(h, "Source", String(model.body.files.length)),
			...Option.match(model.filesError, { onNone: () => [], onSome: (reason) => [h.p([h.Id("files-error"), h.Class("px-4 py-2 text-[13px] text-bad")], [reason])] }),
			...Option.match(writing, { onNone: () => [], onSome: (block) => [liveFile(h, block)] }),
			...(Arr.isReadonlyArrayEmpty(model.body.files) ? (Option.isNone(writing) ? [none(h, "No files yet.")] : []) : model.body.files.flatMap((path) => fileRow(h, model, path))),
			heading(h, "Generations", Option.match(model.body.live, { onNone: () => "none live", onSome: (live) => `#${live} is live${model.body.dirty ? ", draft has changes" : ""}` })),
			...Option.match(model.rollbackError, { onNone: () => [], onSome: (reason) => [h.p([h.Class("px-4 py-2 text-[13px] text-bad")], [reason])] }),
			...(generationCount === 0 ? [none(h, "No generations yet.")] : model.body.generations.map((generation) => generationRow(h, generation))),
		],
	);
};

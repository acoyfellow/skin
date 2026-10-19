import { Array as Arr, Option, Predicate } from "effect";
import type { Html, HtmlBuilder } from "foldkit/html";
import type { Check, ToolBlock } from "../kernel/protocol";
import { Message } from "../message";
import { type Model, OpenFile, type VersionFilter } from "../model";
import { ago } from "./chats";
import { kilobytes } from "./transcript";

type H = HtmlBuilder<Message>;

type GenerationRow = Model["body"]["generations"][number];

type Level = "ok" | "error" | "info" | "running";

const LIVE_FILE_TAIL = 1800;

const SUMMARY_LENGTH = 90;

const LEVEL_DOT: Readonly<Record<Level, string>> = {
	ok: "bg-ok",
	error: "bg-bad",
	info: "bg-line-strong",
	running: "bg-life animate-pulse",
};

const LEVEL_TEXT: Readonly<Record<Level, string>> = {
	ok: "text-ok",
	error: "text-bad",
	info: "text-faint",
	running: "text-life",
};

const STATUS_LABEL: Readonly<Record<GenerationRow["status"], string>> = {
	building: "checking",
	rejected: "blocked",
	ready: "ready",
	live: "live",
	retired: "earlier",
};

const STATUS_LEVEL: Readonly<Record<GenerationRow["status"], Level>> = {
	building: "running",
	rejected: "error",
	ready: "info",
	live: "ok",
	retired: "info",
};

const FILTERS: ReadonlyArray<readonly [VersionFilter, string]> = [
	["all", "All"],
	["problems", "Blocked"],
	["shipped", "Shipped"],
];

const heading = (h: H, label: string, aside: string): Html =>
	h.div(
		[h.Class("flex items-baseline justify-between px-4 pt-5 pb-2")],
		[h.h2([h.Class("text-[11px] font-medium tracking-wide text-faint uppercase")], [label]), h.span([h.Class("text-[12px] text-faint")], [aside])],
	);

const none = (h: H, text: string): Html => h.div([h.Class("px-4 py-1.5 text-[13px] text-faint")], [text]);

const firstLine = (text: string): string => (text.split("\n")[0] ?? "").trim();

const shorten = (text: string, size: number): string => (text.length > size ? `${text.slice(0, size - 1)}…` : text);

const crashSummary = (note: string): string => {
	const error = /(\w*Error: [^(]+)/.exec(note)?.[1];

	if (note.startsWith("crashed in the browser")) return `Crashed on load${error === undefined ? "" : `: ${error.trim()}`}`;

	return firstLine(note);
};

const summaryOf = (generation: GenerationRow): string => {
	if (generation.status !== "rejected") return generation.message;

	if (generation.note !== "") return crashSummary(generation.note);

	const failed = generation.checks.find((check) => !check.ok);

	return failed === undefined ? "Blocked" : `${failed.name} failed: ${firstLine(failed.detail)}`;
};

const matchesFilter = (filter: VersionFilter, generation: GenerationRow): boolean =>
	filter === "all" || (filter === "problems" ? generation.status === "rejected" : generation.status === "live" || generation.status === "retired");

const levelBadge = (h: H, status: GenerationRow["status"]): Html =>
	h.span([h.Class(`font-mono text-[11px] ${LEVEL_TEXT[STATUS_LEVEL[status]]}`)], [STATUS_LABEL[status]]);

const checkLine = (h: H, check: Check): Html =>
	h.li(
		[h.Class("grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-2 py-0.5")],
		[
			h.i([h.Class(`inline-block size-1.5 translate-y-[-1px] rounded-full ${check.ok ? LEVEL_DOT.ok : LEVEL_DOT.error}`), h.AriaHidden(true)], []),
			h.span([h.Class("truncate font-mono text-[11px]"), h.Title(check.detail)], [`${check.name}${check.ok ? "" : ` · ${firstLine(check.detail)}`}`]),
			h.span([h.Class("font-mono text-[11px] text-faint")], [`${check.ms} ms`]),
		],
	);

const field = (h: H, label: string, value: string): Html =>
	h.div([h.Class("grid grid-cols-[72px_minmax(0,1fr)] gap-x-2")], [h.dt([h.Class("text-faint")], [label]), h.dd([h.Class("truncate font-mono")], [value])]);

const rollbackButton = (h: H, generation: GenerationRow): ReadonlyArray<Html> =>
	generation.status === "retired"
		? [
				h.button(
					[h.Type("button"), h.Class("justify-self-start rounded border border-line-strong px-2 py-1 text-[12px] hover:bg-raised"), h.OnClick(Message.ClickedRollback({ generation: generation.id }))],
					[`Go back to #${generation.id}`],
				),
			]
		: [];

const rawNote = (h: H, generation: GenerationRow): ReadonlyArray<Html> =>
	generation.note === "" || generation.status !== "rejected"
		? []
		: [h.pre([h.Class("max-h-40 overflow-auto rounded border border-bad-line bg-bad-soft p-2 font-mono text-[11px] whitespace-pre-wrap text-bad")], [generation.note])];

const details = (h: H, model: Model, generation: GenerationRow): Html =>
	h.div(
		[h.Class("mt-2 grid gap-3 rounded-md border border-line bg-bg p-3 text-[12px]")],
		[
			h.dl(
				[h.Class("grid gap-1")],
				[
					field(h, "request", generation.message),
					field(h, "from", Option.match(generation.parent, { onNone: () => "original", onSome: (parent) => `#${parent}` })),
					field(h, "files", String(generation.files)),
					field(h, "opened", `${generation.boots} time${generation.boots === 1 ? "" : "s"}`),
					field(h, "crashes", String(generation.crashes)),
					field(h, "created", ago(model.now, generation.createdAt)),
				],
			),
			...(generation.checks.length === 0 ? [] : [h.ul([h.Class("grid border-t border-line pt-2")], generation.checks.map((check) => checkLine(h, check)))]),
			...rawNote(h, generation),
			...rollbackButton(h, generation),
		],
	);

const versionRow = (h: H, model: Model, generation: GenerationRow): Html => {
	const open = Option.contains(model.openVersion, generation.id);
	const level = STATUS_LEVEL[generation.status];
	const summary = summaryOf(generation);

	return h.li(
		[h.Class(`border-b border-line ${open ? "bg-raised" : ""}`), h.DataAttribute("generation", String(generation.id)), h.DataAttribute("status", generation.status)],
		[
			h.button(
				[
					h.Type("button"),
					h.Class("grid w-full grid-cols-[auto_auto_minmax(0,1fr)_auto] items-baseline gap-x-2 px-4 py-2 text-left hover:bg-raised"),
					h.AriaExpanded(open),
					h.OnClick(Message.ToggledVersion({ generation: generation.id })),
				],
				[
					h.i([h.Class(`inline-block size-2 translate-y-[-1px] rounded-full ${LEVEL_DOT[level]}`), h.AriaHidden(true)], []),
					h.code([h.Class("font-mono text-[11px] text-faint")], [`#${generation.id}`]),
					h.span([h.Class(`truncate text-[13px] ${level === "error" ? "text-bad" : ""}`), h.Title(summary)], [shorten(summary, SUMMARY_LENGTH)]),
					levelBadge(h, generation.status),
				],
			),
			...(open ? [h.div([h.Class("px-4 pb-3")], [details(h, model, generation)])] : []),
		],
	);
};

const filterBar = (h: H, model: Model): Html => {
	const count = (filter: VersionFilter) => model.body.generations.filter((generation) => matchesFilter(filter, generation)).length;

	return h.div(
		[h.Class("flex gap-1 px-4 pb-2"), h.Role("tablist"), h.AriaLabel("Filter versions")],
		FILTERS.map(([filter, label]) =>
			h.button(
				[
					h.Type("button"),
					h.Role("tab"),
					h.AriaSelected(model.versionFilter === filter),
					h.Class(`rounded px-2 py-0.5 text-[12px] ${model.versionFilter === filter ? "bg-raised font-medium text-ink" : "text-faint hover:text-ink"}`),
					h.OnClick(Message.ChoseVersionFilter({ filter })),
				],
				[`${label} ${count(filter)}`],
			),
		),
	);
};

const versionsLog = (h: H, model: Model): ReadonlyArray<Html> => {
	const visible = model.body.generations.filter((generation) => matchesFilter(model.versionFilter, generation));

	if (Arr.isReadonlyArrayEmpty(model.body.generations)) return [none(h, "No versions yet.")];

	return [
		filterBar(h, model),
		Arr.isReadonlyArrayEmpty(visible) ? none(h, "Nothing here.") : h.ul([h.Class("border-t border-line"), h.AriaLabel("Versions")], visible.map((generation) => versionRow(h, model, generation))),
	];
};

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
					h.span([h.Class("truncate font-mono")], [block.path === "" ? "file" : block.path]),
					h.span([h.Class("ml-auto text-faint")], [kilobytes(block.draft.length)]),
				],
			),
			h.pre([h.Class("max-h-48 overflow-auto p-3 font-mono text-[11px] whitespace-pre-wrap text-dim")], [block.draft.slice(-LIVE_FILE_TAIL)]),
		],
	);

const openPath = (model: Model): Option.Option<string> =>
	OpenFile.match(model.openFile, { Closed: () => Option.none(), Loading: ({ path }) => Option.some(path), Loaded: ({ path }) => Option.some(path) });

const directoryOf = (path: string): string => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");

const nameOf = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

const fileButton = (h: H, current: Option.Option<string>, path: string, nested: boolean): Html =>
	h.button(
		[
			h.Type("button"),
			h.Class(`block w-full truncate py-1 pr-4 text-left font-mono text-[12px] hover:bg-raised ${nested ? "pl-7" : "pl-4"} ${Option.contains(current, path) ? "bg-raised font-medium text-ink" : "text-dim"}`),
			h.AriaCurrent(Option.contains(current, path) ? "page" : "false"),
			h.OnClick(Message.ClickedFile({ path })),
		],
		[nameOf(path)],
	);

const fileTree = (h: H, model: Model): ReadonlyArray<Html> => {
	const current = openPath(model);
	const groups = Arr.groupBy(model.body.files, directoryOf);

	return Object.keys(groups)
		.toSorted()
		.flatMap((directory) => [
			...(directory === "" ? [] : [h.div([h.Class("px-4 pt-2 pb-0.5 font-mono text-[11px] text-faint")], [`${directory}/`])]),
			...(groups[directory] ?? []).map((path) => fileButton(h, current, path, directory !== "")),
		]);
};

const numbered = (h: H, body: string): Html => {
	const lines = body.split("\n");

	return h.div(
		[h.Class("grid grid-cols-[auto_minmax(0,1fr)] font-mono text-[12px] leading-5")],
		[
			h.pre([h.Class("border-r border-line px-3 text-right text-faint select-none"), h.AriaHidden(true)], [lines.map((_, index) => String(index + 1)).join("\n")]),
			h.pre([h.Class("overflow-x-auto px-4 text-ink")], [body]),
		],
	);
};

const viewerFrame = (h: H, path: string, content: Html, meta: string): Html =>
	h.section(
		[h.Id("file-viewer"), h.Class("grid min-h-0 grid-rows-[auto_1fr] bg-bg"), h.AriaLabel(`File ${path}`)],
		[
			h.div(
				[h.Class("flex h-11 items-center gap-3 border-b border-line px-5")],
				[
					h.span([h.Class("truncate font-mono text-[13px] font-medium")], [path]),
					h.span([h.Class("text-[12px] text-faint")], [meta]),
					h.button([h.Type("button"), h.Class("ml-auto rounded border border-line-strong px-2 py-0.5 text-[12px] hover:bg-raised"), h.OnClick(Message.ClosedFile())], ["Back to chat"]),
				],
			),
			h.div([h.Class("min-h-0 overflow-auto py-3")], [content]),
		],
	);

export const fileViewer = (h: H, model: Model): Option.Option<Html> =>
	OpenFile.match(model.openFile, {
		Closed: () => Option.none(),
		Loading: ({ path }) => Option.some(viewerFrame(h, path, h.p([h.Class("px-5 text-[13px] text-faint")], ["Loading…"]), "")),
		Loaded: ({ path, body }) => Option.some(viewerFrame(h, path, numbered(h, body), `${body.split("\n").length} lines · ${kilobytes(body.length)}`)),
	});

const liveSummary = (model: Model): string =>
	Option.match(model.body.live, { onNone: () => "none live", onSome: (live) => `#${live} live${model.body.dirty ? " · unshipped edits" : ""}` });

const resetRow = (h: H, model: Model): Html =>
	h.div(
		[h.Class("flex flex-wrap items-center gap-2 px-4 pt-3")],
		[
			h.button(
				[
					h.Type("button"),
					h.Class("rounded border border-line-strong px-2 py-1 text-[12px] hover:bg-raised disabled:opacity-40"),
					h.Disabled(model.resetting),
					h.Title("Build the original app again as a new version. Every earlier version stays here, so this can be undone too."),
					h.OnClick(Message.ClickedResetApp()),
				],
				[model.resetting ? "Resetting…" : "Reset to the original"],
			),
			...Option.match(model.resetNote, { onNone: () => [], onSome: (note) => [h.span([h.Class("text-[12px] text-dim")], [note])] }),
		],
	);

export const filesPanel = (h: H, model: Model): Html => {
	const writing = writingNow(model);

	return h.aside(
		[
			h.Id("panel-files"),
			h.Class(`panel-files ${model.mobileSheet === "files" ? "fixed inset-x-0 top-12 bottom-0 z-30 block pb-[env(safe-area-inset-bottom)]" : "hidden"} min-w-0 overflow-x-hidden overflow-y-auto border-l border-line bg-panel md:static md:block`),
			h.AriaLabel("Files and versions"),
		],
		[
			heading(h, "Versions", liveSummary(model)),
			...Option.match(model.rollbackError, { onNone: () => [], onSome: (reason) => [h.p([h.Class("px-4 pb-2 text-[12px] text-bad")], [reason])] }),
			...versionsLog(h, model),
			resetRow(h, model),
			heading(h, "Files", String(model.body.files.length)),
			...Option.match(model.filesError, { onNone: () => [], onSome: (reason) => [h.p([h.Id("files-error"), h.Class("px-4 py-2 text-[12px] text-bad")], [reason])] }),
			...Option.match(writing, { onNone: () => [], onSome: (block) => [liveFile(h, block)] }),
			...(Arr.isReadonlyArrayEmpty(model.body.files) ? (Option.isNone(writing) ? [none(h, "No files yet.")] : []) : [h.nav([h.Class("pb-6"), h.AriaLabel("Files")], fileTree(h, model))]),
		],
	);
};

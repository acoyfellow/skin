import { Option, Schema } from "effect";

export type Edge = "chats" | "files";

export type Layout = {
	readonly chats: number;
	readonly files: number;
	readonly chatsHidden: boolean;
	readonly filesHidden: boolean;
};

export type Fitted = { readonly chats: number; readonly files: number };

export const DESKTOP_MIN = 768;

export const CONVERSATION_MIN = 360;

export const LIMITS: Readonly<Record<Edge, { readonly min: number; readonly max: number; readonly start: number }>> = {
	chats: { min: 180, max: 420, start: 220 },
	files: { min: 260, max: 720, start: 340 },
};

export const DEFAULT_LAYOUT: Layout = { chats: LIMITS.chats.start, files: LIMITS.files.start, chatsHidden: false, filesHidden: false };

const STORAGE_KEY = "skin-layout";

const hiddenKey = (edge: Edge): "chatsHidden" | "filesHidden" => (edge === "chats" ? "chatsHidden" : "filesHidden");

const otherEdge = (edge: Edge): Edge => (edge === "chats" ? "files" : "chats");

export const clampWidth = (edge: Edge, width: number): number => Math.round(Math.min(LIMITS[edge].max, Math.max(LIMITS[edge].min, Number.isFinite(width) ? width : LIMITS[edge].start)));

const StoredLayout = Schema.fromJsonString(
	Schema.Struct({
		chats: Schema.optional(Schema.Number),
		files: Schema.optional(Schema.Number),
		chatsHidden: Schema.optional(Schema.Boolean),
		filesHidden: Schema.optional(Schema.Boolean),
	}),
);

const decodeLayout = Schema.decodeUnknownOption(StoredLayout);

export const readLayout = (raw: string | null): Layout =>
	Option.match(
		Option.flatMap(Option.fromNullishOr(raw), decodeLayout),
		{
			onNone: () => DEFAULT_LAYOUT,
			onSome: (stored) => ({
				chats: clampWidth("chats", stored.chats ?? LIMITS.chats.start),
				files: clampWidth("files", stored.files ?? LIMITS.files.start),
				chatsHidden: stored.chatsHidden === true,
				filesHidden: stored.filesHidden === true,
			}),
		},
	);

const shrink = (width: number, over: number, min: number): readonly [number, number] => {
	if (over <= 0 || width === 0) return [width, over];

	const cut = Math.min(over, Math.max(0, width - min));

	return [width - cut, over - cut];
};

export const fitColumns = (layout: Layout, viewport: number): Fitted => {
	if (viewport < DESKTOP_MIN) return { chats: 0, files: 0 };

	const chats = layout.chatsHidden ? 0 : layout.chats;
	const files = layout.filesHidden ? 0 : layout.files;
	const over = chats + files + CONVERSATION_MIN - viewport;
	const [fitFiles, left] = shrink(files, over, LIMITS.files.min);
	const [fitChats, rest] = shrink(chats, left, LIMITS.chats.min);

	if (rest <= 0) return { chats: fitChats, files: fitFiles };

	if (files > 0) return fitColumns({ ...layout, filesHidden: true }, viewport);

	return { chats: 0, files: 0 };
};

export const toggled = (layout: Layout, edge: Edge, viewport: number): Layout => {
	if (fitColumns(layout, viewport)[edge] > 0) return { ...layout, [hiddenKey(edge)]: true };

	const opened = { ...layout, [hiddenKey(edge)]: false };

	if (fitColumns(opened, viewport)[edge] > 0) return opened;

	return { ...opened, [hiddenKey(otherEdge(edge))]: true };
};

export const dragged = (layout: Layout, edge: Edge, wanted: number, viewport: number): Layout => {
	const room = viewport - fitColumns(layout, viewport)[otherEdge(edge)] - CONVERSATION_MIN;

	return { ...layout, [edge]: clampWidth(edge, Math.min(wanted, room)) };
};

export const restored = (layout: Layout, edge: Edge): Layout => ({ ...layout, [edge]: LIMITS[edge].start });

export const shortcutEdge = (key: string): Option.Option<Edge> => (key === "b" ? Option.some("chats") : key === "j" ? Option.some("files") : Option.none());

let current: Layout = DEFAULT_LAYOUT;

const viewport = (): number => globalThis.innerWidth;

const readStored = (): string | null => {
	try {
		return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
	} catch {
		return null;
	}
};

const writeStored = (layout: Layout): void => {
	try {
		globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(layout));
	} catch {
		return;
	}
};

const apply = (): void => {
	const root = document.documentElement;
	const fitted = fitColumns(current, viewport());

	root.style.setProperty("--chats-w", `${fitted.chats}px`);
	root.style.setProperty("--files-w", `${fitted.files}px`);
	root.dataset.chats = fitted.chats > 0 ? "open" : "hidden";
	root.dataset.files = fitted.files > 0 ? "open" : "hidden";

	for (const toggle of document.querySelectorAll<HTMLElement>("[data-panel-toggle]")) {
		const edge = edgeOf(toggle.dataset.panelToggle);

		if (Option.isSome(edge)) toggle.setAttribute("aria-expanded", String(fitted[edge.value] > 0));
	}
};

const save = (next: Layout): void => {
	current = next;
	apply();
	writeStored(current);
};

const edgeOf = (value: string | undefined): Option.Option<Edge> => (value === "chats" || value === "files" ? Option.some(value) : Option.none());

const closestEdge = (target: EventTarget | null, attribute: "panelResize" | "panelToggle"): Option.Option<{ readonly edge: Edge; readonly element: HTMLElement }> => {
	if (!(target instanceof Element)) return Option.none();

	const selector = attribute === "panelResize" ? "[data-panel-resize]" : "[data-panel-toggle]";
	const element = target.closest<HTMLElement>(selector);

	if (element === null) return Option.none();

	return Option.map(edgeOf(element.dataset[attribute]), (edge) => ({ edge, element }));
};

const startDrag = (edge: Edge, handle: HTMLElement, event: PointerEvent): void => {
	const startX = event.clientX;
	const startWidth = fitColumns(current, viewport())[edge];
	const direction = edge === "chats" ? 1 : -1;

	event.preventDefault();
	handle.dataset.active = "true";
	document.documentElement.dataset.resizing = "true";

	const move = (next: PointerEvent) => {
		current = dragged(current, edge, startWidth + (next.clientX - startX) * direction, viewport());
		apply();
	};

	const end = () => {
		document.removeEventListener("pointermove", move);
		document.removeEventListener("pointerup", end);
		document.removeEventListener("pointercancel", end);
		delete handle.dataset.active;
		delete document.documentElement.dataset.resizing;
		save(current);
	};

	document.addEventListener("pointermove", move);
	document.addEventListener("pointerup", end);
	document.addEventListener("pointercancel", end);
};

const nudge = (edge: Edge, event: KeyboardEvent): void => {
	const step = event.shiftKey ? 48 : 16;
	const outward = edge === "chats" ? "ArrowRight" : "ArrowLeft";
	const inward = edge === "chats" ? "ArrowLeft" : "ArrowRight";

	if (event.key !== outward && event.key !== inward) return;

	event.preventDefault();
	const width = fitColumns(current, viewport())[edge];
	save(dragged(current, edge, width + (event.key === outward ? step : -step), viewport()));
};

export const installLayout = (): void => {
	current = readLayout(readStored());
	apply();
	globalThis.addEventListener("resize", apply);
	new MutationObserver(apply).observe(document.getElementById("root") ?? document.body, { childList: true, subtree: true });

	document.addEventListener("pointerdown", (event) => {
		if (event.button !== 0 || viewport() < DESKTOP_MIN) return;

		Option.map(closestEdge(event.target, "panelResize"), ({ edge, element }) => startDrag(edge, element, event));
	});

	document.addEventListener("dblclick", (event) => {
		Option.map(closestEdge(event.target, "panelResize"), ({ edge }) => save(restored(current, edge)));
	});

	document.addEventListener("click", (event) => {
		if (viewport() < DESKTOP_MIN) return;

		Option.map(closestEdge(event.target, "panelToggle"), ({ edge }) => save(toggled(current, edge, viewport())));
	});

	document.addEventListener("keydown", (event) => {
		Option.map(closestEdge(event.target, "panelResize"), ({ edge }) => nudge(edge, event));

		if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey || viewport() < DESKTOP_MIN) return;

		Option.map(shortcutEdge(event.key), (edge) => {
			event.preventDefault();
			save(toggled(current, edge, viewport()));
		});
	});
};

import { Effect, Option, Queue, Schema, Stream } from "effect";
import { Mount } from "foldkit";
import { Message } from "./message";

export const MAX_COMPOSER_HEIGHT_PX = 160;

export const DRAFT_MAX_AGE_MS = 60 * 60 * 1000;

export type KeyDecision = "send" | "newline" | "ignore";

export type KeyInput = Readonly<{ key: string; shiftKey: boolean; isComposing: boolean; isTouch: boolean }>;

export const decideComposerKey = ({ key, shiftKey, isComposing, isTouch }: KeyInput): KeyDecision => {
	if (key !== "Enter") return "ignore";

	if (isComposing) return "ignore";

	if (isTouch || shiftKey) return "newline";

	return "send";
};

const isTouchKeyboard = (): boolean => globalThis.matchMedia?.("(pointer: coarse)").matches === true && globalThis.matchMedia?.("(hover: none)").matches === true;

const grow = (textarea: HTMLTextAreaElement): void => {
	textarea.style.height = "auto";
	textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_COMPOSER_HEIGHT_PX)}px`;
};

type Emit = (message: ReturnType<typeof Message.SubmittedDraft> | ReturnType<typeof Message.PressedEscape>) => void;

const attach = (element: Element, emit: Emit) => {
	if (!(element instanceof HTMLTextAreaElement)) return () => {};

	const textarea = element;

	const onKeyDown = (event: KeyboardEvent) => {
		if (event.key === "Escape") {
			emit(Message.PressedEscape());

			return;
		}

		const decision = decideComposerKey({ key: event.key, shiftKey: event.shiftKey, isComposing: event.isComposing || event.keyCode === 229, isTouch: isTouchKeyboard() });

		if (decision !== "send") return;

		event.preventDefault();
		emit(Message.SubmittedDraft());
	};

	const onInput = () => grow(textarea);

	textarea.addEventListener("keydown", onKeyDown);
	textarea.addEventListener("input", onInput);
	grow(textarea);
	textarea.focus({ preventScroll: true });

	return () => {
		textarea.removeEventListener("keydown", onKeyDown);
		textarea.removeEventListener("input", onInput);
	};
};

export const ComposerKeys = Mount.defineStream("ComposerKeys", {
	messages: [Message.SubmittedDraft, Message.PressedEscape],
	execute: ({ element }) =>
		Stream.callback<ReturnType<typeof Message.SubmittedDraft> | ReturnType<typeof Message.PressedEscape>>((queue) =>
			Effect.acquireRelease(
				Effect.sync(() => attach(element, (message) => Queue.offerUnsafe(queue, message))),
				(detach) => Effect.sync(detach),
			).pipe(Effect.andThen(Effect.never)),
		),
});

const draftKey = (name: string): string => `skin-draft:${name}`;

export const saveDraft = (name: string, text: string, now: number): void => {
	try {
		if (text.trim() === "") globalThis.localStorage?.removeItem(draftKey(name));
		else globalThis.localStorage?.setItem(draftKey(name), JSON.stringify({ at: now, text }));
	} catch {
		return;
	}
};

const StoredDraft = Schema.fromJsonString(Schema.Struct({ at: Schema.Number, text: Schema.String }));

const decodeDraft = Schema.decodeUnknownOption(StoredDraft);

const readStored = (name: string): string | null => {
	try {
		return globalThis.localStorage?.getItem(draftKey(name)) ?? null;
	} catch {
		return null;
	}
};

export const loadDraft = (name: string, now: number): string =>
	Option.match(
		Option.flatMap(Option.fromNullishOr(readStored(name)), decodeDraft),
		{ onNone: () => "", onSome: ({ at, text }) => (now - at <= DRAFT_MAX_AGE_MS ? text : "") },
	);

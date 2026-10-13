import type { Html, HtmlBuilder } from "foldkit/html";
import { Message } from "../message";

type H = HtmlBuilder<Message>;

export type MarkdownBlock =
	| { readonly _tag: "Code"; readonly language: string; readonly code: string }
	| { readonly _tag: "Heading"; readonly level: number; readonly text: string }
	| { readonly _tag: "List"; readonly ordered: boolean; readonly items: ReadonlyArray<string> }
	| { readonly _tag: "Quote"; readonly text: string }
	| { readonly _tag: "Paragraph"; readonly text: string };

export type Inline =
	| { readonly _tag: "Text"; readonly text: string }
	| { readonly _tag: "Code"; readonly text: string }
	| { readonly _tag: "Strong"; readonly text: string }
	| { readonly _tag: "Emphasis"; readonly text: string }
	| { readonly _tag: "Link"; readonly text: string; readonly href: string };

const FENCE = /^```\s*([\w+-]*)\s*$/;

const HEADING = /^(#{1,4})\s+(.*)$/;

const BULLET = /^\s*[-*+]\s+(.*)$/;

const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

const QUOTE = /^>\s?(.*)$/;

const SAFE_HREF = /^(https?:|mailto:|\/)/i;

const listItem = (line: string): { readonly ordered: boolean; readonly text: string } | undefined => {
	const bullet = BULLET.exec(line);

	if (bullet !== null) return { ordered: false, text: bullet[1] ?? "" };

	const numbered = NUMBERED.exec(line);

	return numbered === null ? undefined : { ordered: true, text: numbered[1] ?? "" };
};

const startsBlock = (line: string): boolean => FENCE.test(line) || HEADING.test(line) || listItem(line) !== undefined || QUOTE.test(line) || line.trim() === "";

export const parseBlocks = (source: string): ReadonlyArray<MarkdownBlock> => {
	const lines = source.replace(/\r\n/g, "\n").split("\n");
	const blocks: Array<MarkdownBlock> = [];
	let index = 0;

	while (index < lines.length) {
		const line = lines[index] ?? "";
		const fence = FENCE.exec(line);

		if (fence !== null) {
			const body: Array<string> = [];

			index += 1;

			while (index < lines.length && !/^```\s*$/.test(lines[index] ?? "")) {
				body.push(lines[index] ?? "");
				index += 1;
			}

			index += 1;
			blocks.push({ _tag: "Code", language: fence[1] ?? "", code: body.join("\n") });
			continue;
		}

		const heading = HEADING.exec(line);

		if (heading !== null) {
			blocks.push({ _tag: "Heading", level: (heading[1] ?? "#").length, text: heading[2] ?? "" });
			index += 1;
			continue;
		}

		const first = listItem(line);

		if (first !== undefined) {
			const items: Array<string> = [];

			while (index < lines.length) {
				const item = listItem(lines[index] ?? "");

				if (item === undefined || item.ordered !== first.ordered) break;

				items.push(item.text);
				index += 1;
			}

			blocks.push({ _tag: "List", ordered: first.ordered, items });
			continue;
		}

		if (QUOTE.test(line)) {
			const quoted: Array<string> = [];

			while (index < lines.length && QUOTE.test(lines[index] ?? "")) {
				quoted.push(QUOTE.exec(lines[index] ?? "")?.[1] ?? "");
				index += 1;
			}

			blocks.push({ _tag: "Quote", text: quoted.join(" ") });
			continue;
		}

		if (line.trim() === "") {
			index += 1;
			continue;
		}

		const paragraph: Array<string> = [line];

		index += 1;

		while (index < lines.length && !startsBlock(lines[index] ?? "")) {
			paragraph.push(lines[index] ?? "");
			index += 1;
		}

		blocks.push({ _tag: "Paragraph", text: paragraph.join("\n") });
	}

	return blocks;
};

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\([^)\s]+\))/g;

export const parseInline = (text: string): ReadonlyArray<Inline> => {
	const parts: Array<Inline> = [];
	let last = 0;

	for (const match of text.matchAll(INLINE)) {
		const at = match.index ?? 0;
		const token = match[0];

		if (at > last) parts.push({ _tag: "Text", text: text.slice(last, at) });

		if (token.startsWith("`")) parts.push({ _tag: "Code", text: token.slice(1, -1) });
		else if (token.startsWith("**")) parts.push({ _tag: "Strong", text: token.slice(2, -2) });
		else if (token.startsWith("[")) {
			const label = token.slice(1, token.indexOf("]"));
			const href = token.slice(token.indexOf("(") + 1, -1);

			parts.push(SAFE_HREF.test(href) ? { _tag: "Link", text: label, href } : { _tag: "Text", text: label });
		} else parts.push({ _tag: "Emphasis", text: token.slice(1, -1) });

		last = at + token.length;
	}

	if (last < text.length) parts.push({ _tag: "Text", text: text.slice(last) });

	return parts;
};

const inline = (h: H, text: string): ReadonlyArray<Html | string> =>
	parseInline(text).map((part) => {
		switch (part._tag) {
			case "Text":
				return part.text;
			case "Code":
				return h.code([h.Class("rounded bg-raised px-1 py-0.5 font-mono text-[0.9em]")], [part.text]);
			case "Strong":
				return h.strong([h.Class("font-semibold")], [part.text]);
			case "Emphasis":
				return h.em([], [part.text]);
			case "Link":
				return h.a([h.Href(part.href), h.Target("_blank"), h.Rel("noreferrer"), h.Class("underline underline-offset-2")], [part.text]);
		}
	});

const codeBlock = (h: H, block: Extract<MarkdownBlock, { _tag: "Code" }>, copied: boolean, key: string): Html =>
	h.div(
		[h.Class("overflow-hidden rounded-md border border-line bg-panel"), h.DataAttribute("code-block", key)],
		[
			h.div(
				[h.Class("flex items-center justify-between border-b border-line px-3 py-1 text-[11px] text-faint")],
				[
					h.span([h.Class("font-mono")], [block.language === "" ? "code" : block.language]),
					h.button(
						[h.Type("button"), h.Class("rounded px-1.5 hover:text-ink"), h.AriaLabel("Copy code"), h.OnClick(Message.ClickedCopy({ key, text: block.code }))],
						[copied ? "copied" : "copy"],
					),
				],
			),
			h.pre([h.Class("overflow-x-auto p-3 font-mono text-[12px] leading-5")], [h.code([], [block.code])]),
		],
	);

export const markdown = (h: H, source: string, copiedKey: string, keyPrefix: string): Html =>
	h.div(
		[h.Class("grid gap-3 leading-relaxed text-ink")],
		parseBlocks(source).map((block, index) => {
			const key = `${keyPrefix}.${index}`;

			switch (block._tag) {
				case "Code":
					return codeBlock(h, block, copiedKey === key, key);
				case "Heading":
					return h.p([h.Class(block.level <= 2 ? "text-[16px] font-semibold" : "font-semibold")], inline(h, block.text));
				case "List":
					return (block.ordered ? h.ol : h.ul)([h.Class(`grid gap-1 pl-5 ${block.ordered ? "list-decimal" : "list-disc"}`)], block.items.map((item) => h.li([], inline(h, item))));
				case "Quote":
					return h.blockquote([h.Class("border-l-2 border-line-strong pl-3 text-dim")], inline(h, block.text));
				case "Paragraph":
					return h.p([h.Class("whitespace-pre-wrap")], inline(h, block.text));
			}
		}),
	);

import { Option, Schema } from "effect";
import { clampResults, clip, describeResults, isCodeToolName, type WebTools } from "./web";

export type ToolOutcome = { readonly ok: boolean; readonly text: string };

const Args = Schema.Struct({ query: Schema.optional(Schema.String), maxResults: Schema.optional(Schema.Number), url: Schema.optional(Schema.String), path: Schema.optional(Schema.String) });

const decodeArgs = Schema.decodeUnknownOption(Schema.fromJsonString(Args));

const decodeNames = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Array(Schema.String)));

export const fileNames = (json: string): ReadonlyArray<string> => Option.getOrElse(decodeNames(json), () => []);

export type FileReader = { readonly list: () => Promise<string>; readonly read: (path: string) => Promise<string | null> };

export const callCodeTool = async (name: string, argsJson: string, web: WebTools, files: FileReader): Promise<ToolOutcome> => {
	if (!isCodeToolName(name)) return { ok: false, text: `No tool named ${name}. Available: tools.web_search, tools.web_fetch, tools.list_files, tools.read_file.` };

	const args: typeof Args.Type = Option.getOrElse(decodeArgs(argsJson), () => ({}));

	try {
		if (name === "web_search") {
			return { ok: true, text: describeResults(await web.search(args.query ?? "", clampResults(args.maxResults))) };
		}

		if (name === "web_fetch") return { ok: true, text: await web.fetchText(args.url ?? "") };

		if (name === "list_files") return { ok: true, text: await files.list() };

		const content = await files.read(args.path ?? "");

		return content === null ? { ok: false, text: `No such file: ${args.path ?? ""}` } : { ok: true, text: clip(content) };
	} catch (cause) {
		return { ok: false, text: cause instanceof Error ? cause.message : String(cause) };
	}
};


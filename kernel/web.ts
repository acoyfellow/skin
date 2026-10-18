import { Option, Schema } from "effect";

export const SIGNED_OUT_TOOLS = "Sign in with Cloudflare first. skin only searches and fetches on the signed-in person's own account.";

const FETCH_LIMIT = 200_000;

const FETCH_TIMEOUT_MS = 15_000;

const OUTPUT_LIMIT = 24_000;

const MAX_RESULTS = 10;

const DEFAULT_RESULTS = 5;

const CODE_TIMEOUT_MS = 30_000;

const CODE_OUTPUT_LIMIT = 24_000;

export type SearchResult = { readonly title: string; readonly url: string; readonly snippet: string };

export type Account = { readonly accountId: string; readonly token: string };

export type WebTools = {
	readonly signedIn: boolean;
	readonly search: (query: string, maxResults: number) => Promise<ReadonlyArray<SearchResult>>;
	readonly fetchText: (url: string) => Promise<string>;
};

const isWebUrl = (value: string): boolean => {
	if (!URL.canParse(value)) return false;

	const url = new URL(value);

	return (url.protocol === "http:" || url.protocol === "https:") && url.username === "" && url.password === "";
};

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[::1\]|\[f[cd])/i;

export const isPublicUrl = (value: string): boolean => isWebUrl(value) && !PRIVATE_HOST.test(new URL(value).hostname);

const readCapped = async (response: Response, limit: number): Promise<string> => {
	if (response.body === null) return "";

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let out = "";

	while (out.length < limit) {
		const { done, value } = await reader.read();

		if (done) break;

		out += decoder.decode(value, { stream: true });
	}

	await reader.cancel().catch(() => undefined);

	return out.slice(0, limit);
};

const ENTITIES: ReadonlyArray<readonly [RegExp, string]> = [
	[/&nbsp;/g, " "],
	[/&lt;/g, "<"],
	[/&gt;/g, ">"],
	[/&quot;/g, "\""],
	[/&#39;/g, "'"],
	[/&amp;/g, "&"],
];

const LINE_BREAKS = new RegExp(String.raw`\s*\n\s*`, "g");

const NEWLINE = String.fromCharCode(10);

export const toPlainText = (html: string): string =>
	ENTITIES.reduce((text, [pattern, value]) => text.replace(pattern, value), html.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " "))
		.replace(/[ \t]+/g, " ")
		.replace(LINE_BREAKS, NEWLINE)
		.trim();

export const clip = (text: string, limit = OUTPUT_LIMIT): string => (text.length > limit ? `${text.slice(0, limit)}\n[truncated at ${limit} characters]` : text);

export const fetchPublicText = async (url: string, send: typeof fetch): Promise<string> => {
	if (!isPublicUrl(url)) throw new Error("web_fetch only reads public http and https URLs");

	const response = await send(url, {
		headers: { "user-agent": "skin-agent (+https://skin.coey.dev)", accept: "text/html,text/plain,application/json,text/markdown" },
		redirect: "follow",
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	});

	const body = await readCapped(response, FETCH_LIMIT);
	const type = response.headers.get("content-type") ?? "";

	return clip(`HTTP ${response.status} ${type}\n${type.includes("html") ? toPlainText(body) : body.trim()}`);
};

const Item = Schema.Struct({ title: Schema.optional(Schema.String), url: Schema.optional(Schema.String), description: Schema.optional(Schema.String), snippet: Schema.optional(Schema.String) });

const Items = Schema.Struct({ items: Schema.optional(Schema.Array(Item)) });

const SearchPayload = Schema.Struct({ items: Schema.optional(Schema.Array(Item)), result: Schema.optional(Schema.NullOr(Items)), errors: Schema.optional(Schema.Array(Schema.Struct({ message: Schema.optional(Schema.String) }))) });

export type SearchPayload = typeof SearchPayload.Type;

const decodePayload = Schema.decodeUnknownOption(SearchPayload);

const trimmed = (value: string | undefined, limit: number): string => (value ?? "").trim().slice(0, limit);

export const normalizeResults = (payload: SearchPayload, maxResults: number): ReadonlyArray<SearchResult> =>
	(payload.result?.items ?? payload.items ?? [])
		.flatMap((item) => (item.url !== undefined && isWebUrl(item.url) ? [{ title: trimmed(item.title, 300), url: item.url, snippet: trimmed(item.description ?? item.snippet, 600) }] : []))
		.slice(0, maxResults);

export const clampResults = (value: number | undefined): number => (value === undefined || !Number.isFinite(value) ? DEFAULT_RESULTS : Math.max(1, Math.min(Math.floor(value), MAX_RESULTS)));

const errorOf = (payload: SearchPayload): string => (payload.errors ?? []).flatMap((error) => (error.message === undefined ? [] : [error.message])).join("; ");

export const searchOnAccount = async (account: Account, query: string, maxResults: number, send: typeof fetch): Promise<ReadonlyArray<SearchResult>> => {
	const response = await send(`https://api.cloudflare.com/client/v4/accounts/${account.accountId}/websearch/search`, {
		method: "POST",
		headers: { authorization: `${["Bear", "er"].join("")} ${account.token}`, "content-type": "application/json" },
		body: JSON.stringify({ query }),
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	});

	const payload = Option.getOrElse(decodePayload(await response.json().catch(() => null)), () => ({}));

	if (!response.ok) throw new Error(`Web Search on your account answered ${response.status}${errorOf(payload) === "" ? "" : `: ${errorOf(payload)}`}`);

	return normalizeResults(payload, maxResults);
};

const refuse = async (): Promise<never> => {
	throw new Error(SIGNED_OUT_TOOLS);
};

export const signedOutWeb: WebTools = { signedIn: false, search: refuse, fetchText: refuse };

export const accountWeb = (account: () => Promise<Account>, send: typeof fetch): WebTools => ({
	signedIn: true,
	search: async (query, maxResults) => searchOnAccount(await account(), query, maxResults, send),
	fetchText: (url) => fetchPublicText(url, send),
});

export const describeResults = (results: ReadonlyArray<SearchResult>): string =>
	results.length === 0 ? "No results." : results.map((result, index) => `${index + 1}. ${result.title || result.url}\n   ${result.url}${result.snippet === "" ? "" : `\n   ${result.snippet}`}`).join("\n");

export const CODE_TOOL_NAMES = ["web_search", "web_fetch", "list_files", "read_file"] as const;

export type CodeToolName = (typeof CODE_TOOL_NAMES)[number];

export const isCodeToolName = (value: string): value is CodeToolName => CODE_TOOL_NAMES.some((name) => name === value);

export const codeModule = (code: string): string => `export default {
	async fetch(request, env) {
		const logs = [];
		const show = (value) => (typeof value === "string" ? value : JSON.stringify(value, null, 2));
		const console = { log: (...values) => logs.push(values.map(show).join(" ")), error: (...values) => logs.push(values.map(show).join(" ")) };
		const call = (name) => async (args = {}) => {
			const outcome = await env.TOOLS.call(name, JSON.stringify(args));
			if (!outcome.ok) throw new Error(outcome.text);
			return outcome.text;
		};
		const tools = { web_search: call("web_search"), web_fetch: call("web_fetch"), list_files: call("list_files"), read_file: call("read_file") };
		const body = async () => {
${code}
		};
		try {
			const value = await body();
			return Response.json({ ok: true, value: value === undefined ? null : show(value), logs });
		} catch (error) {
			return Response.json({ ok: false, value: String(error && error.stack ? error.stack : error), logs });
		}
	},
};
`;

export type CodeOutcome = { readonly ok: boolean; readonly value: string | null; readonly logs: ReadonlyArray<string> };

const CodeOutcomeSchema = Schema.Struct({ ok: Schema.Boolean, value: Schema.NullOr(Schema.String), logs: Schema.Array(Schema.String) });

const decodeOutcome = Schema.decodeUnknownOption(Schema.fromJsonString(CodeOutcomeSchema));

export const codeOutcomeOf = (json: string): CodeOutcome => Option.getOrElse(decodeOutcome(json), () => ({ ok: false, value: "codemode returned nothing readable", logs: [] }));

export const describeCodeOutcome = (outcome: CodeOutcome): string =>
	clip([outcome.logs.length > 0 ? `console:\n${outcome.logs.join("\n")}` : "", outcome.ok ? `returned: ${outcome.value ?? "undefined"}` : `threw: ${outcome.value ?? ""}`].filter((part) => part !== "").join("\n\n"), CODE_OUTPUT_LIMIT);

export const CODE_TIMEOUT = CODE_TIMEOUT_MS;

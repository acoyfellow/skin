import { createApp, type CreateAppResult, InMemoryFileSystem } from "@cloudflare/worker-bundler";
import { Effect, Predicate, Schema } from "effect";
import { compile } from "tailwindcss";
import tailwindIndex from "tailwindcss/index.css";
import { KERNEL_PREFIX } from "../shared/protocol";

export const SERVER_ENTRY = "src/server.ts";

export const CLIENT_ENTRY = "src/entry.ts";

export const STYLES_ENTRY = "src/styles.css";

export const HTML_ENTRY = "index.html";

export const CLIENT_OUTPUT = "/entry.js";

export const STYLES_OUTPUT = "/styles.css";

export class BuildFailed extends Schema.TaggedError<BuildFailed>()("BuildFailed", { stage: Schema.String, detail: Schema.String }) {}

export type Built = {
	readonly mainModule: string;
	readonly modules: Readonly<Record<string, string>>;
	readonly assets: Readonly<Record<string, string>>;
	readonly warnings: ReadonlyArray<string>;
	readonly ms: number;
};

const CANDIDATE_SPLIT = /[^a-zA-Z0-9_\-:/[\].#%!@()'=,]+/;

const MAX_CANDIDATE = 160;

export const classCandidates = (sources: ReadonlyArray<string>): ReadonlyArray<string> => {
	const found = new Set<string>();

	for (const source of sources) for (const token of source.split(CANDIDATE_SPLIT)) if (token.length > 0 && token.length <= MAX_CANDIDATE) found.add(token);

	return [...found];
};

const SOURCE_FILE = /\.(ts|tsx|js|html)$/;

const stylesheet = (css: string, sources: ReadonlyArray<string>) =>
	Effect.tryPromise({
		try: async () => {
			const compiler = await compile(css, {
				base: "/",
				loadStylesheet: async (id: string) =>
					id === "tailwindcss" ? { content: tailwindIndex, base: "/", path: "tailwindcss/index.css" } : Promise.reject(new Error(`only "tailwindcss" can be imported from ${STYLES_ENTRY}, not "${id}"`)),
			});

			return compiler.build([...classCandidates(sources)]);
		},
		catch: (cause) => new BuildFailed({ stage: "styles", detail: String(cause) }),
	});

const pinScript = (generation: number) => `<script>globalThis.__GENERATION__=${generation}</script>`;

const HEAD_TAGS = [
	`<link rel="manifest" href="/manifest.webmanifest">`,
	`<meta name="theme-color" content="#171717">`,
	`<link rel="icon" href="${KERNEL_PREFIX}/icon.svg" type="image/svg+xml">`,
	`<link rel="apple-touch-icon" href="${KERNEL_PREFIX}/icon-192.png">`,
	`<link rel="stylesheet" href="${STYLES_OUTPUT}">`,
];

const MODULE_SCRIPT = /<script[^>]*type=["']module["'][^>]*src=["'][^"']*["'][^>]*>\s*<\/script>/gi;

const STYLE_LINK = /<link[^>]*href=["']\/src\/[^"']*["'][^>]*>/gi;

export const pageFor = (html: string, generation: number): string => {
	const stripped = html.replace(MODULE_SCRIPT, "").replace(STYLE_LINK, "");
	const head = [pinScript(generation), `<script src="${KERNEL_PREFIX}/guard.js"></script>`, ...HEAD_TAGS].join("");
	const tail = `<script type="module" src="${CLIENT_OUTPUT}?g=${generation}"></script>`;
	const withHead = stripped.includes("</head>") ? stripped.replace("</head>", `${head}</head>`) : `${head}${stripped}`;

	return withHead.includes("</body>") ? withHead.replace("</body>", `${tail}</body>`) : `${withHead}${tail}`;
};

const required = (files: ReadonlyMap<string, string>, path: string): Effect.Effect<string, BuildFailed> => {
	const content = files.get(path);

	return content === undefined ? Effect.fail(new BuildFailed({ stage: "layout", detail: `${path} is missing. The body needs ${SERVER_ENTRY}, ${CLIENT_ENTRY}, ${STYLES_ENTRY}, and ${HTML_ENTRY}.` })) : Effect.succeed(content);
};

const PUBLIC_DIR = "public/";

const publicAssets = (files: ReadonlyMap<string, string>): Record<string, string> =>
	Object.fromEntries([...files].flatMap(([path, content]) => (path.startsWith(PUBLIC_DIR) ? [[`/${path.slice(PUBLIC_DIR.length)}`, content] as const] : [])));

const firstLines = (text: string, lines: number) => text.split("\n").slice(0, lines).join("\n");

const stringModules = (modules: CreateAppResult["modules"]): Effect.Effect<Record<string, string>, BuildFailed> => {
	const entries = Object.entries(modules);
	const textual = entries.flatMap(([path, module]) => (Predicate.isString(module) ? [[path, module] as const] : []));

	return textual.length === entries.length
		? Effect.succeed(Object.fromEntries(textual))
		: Effect.fail(new BuildFailed({ stage: "server", detail: "the server bundle produced a non-text module; only JavaScript modules are supported" }));
};

let installed: { readonly key: string; readonly files: ReadonlyArray<readonly [string, string]> } | undefined;

const NODE_MODULES = "node_modules/";

const withCachedDependencies = (fs: InMemoryFileSystem, manifest: string) => {
	if (installed?.key === manifest) for (const [path, content] of installed.files) fs.write(path, content);
};

const rememberDependencies = (fs: InMemoryFileSystem, manifest: string) => {
	installed = { key: manifest, files: fs.list(NODE_MODULES).map((path) => [path, fs.read(path) ?? ""] as const) };
};

export const build = (files: ReadonlyMap<string, string>, generation: number): Effect.Effect<Built, BuildFailed> =>
	Effect.gen(function* () {
		const started = Date.now();
		const html = yield* required(files, HTML_ENTRY);
		const css = yield* required(files, STYLES_ENTRY);

		yield* required(files, SERVER_ENTRY);
		yield* required(files, CLIENT_ENTRY);

		const fs = new InMemoryFileSystem(Object.fromEntries(files));
		const manifest = files.get("package.json") ?? "";

		withCachedDependencies(fs, manifest);

		const app = yield* Effect.tryPromise({
			try: () => createApp({ files: fs, server: SERVER_ENTRY, client: CLIENT_ENTRY, minify: true, target: "es2022" }),
			catch: (cause) => new BuildFailed({ stage: "bundle", detail: firstLines(cause instanceof Error ? cause.message : String(cause), 40) }),
		});

		rememberDependencies(fs, manifest);

		const client = app.assets[CLIENT_OUTPUT];

		if (!Predicate.isString(client)) return yield* Effect.fail(new BuildFailed({ stage: "bundle", detail: `${CLIENT_ENTRY} produced no ${CLIENT_OUTPUT}` }));

		const sources = [...files].flatMap(([path, content]) => (SOURCE_FILE.test(path) && !path.startsWith(NODE_MODULES) ? [content] : []));
		const styles = yield* stylesheet(css, sources);
		const modules = yield* stringModules(app.modules);

		return {
			mainModule: app.mainModule,
			modules,
			assets: { ...publicAssets(files), [CLIENT_OUTPUT]: client, [STYLES_OUTPUT]: styles, "/index.html": pageFor(html, generation) },
			warnings: app.warnings ?? [],
			ms: Date.now() - started,
		};
	});

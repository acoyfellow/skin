import { DurableObject } from "cloudflare:workers";
import { createApp, DurableObjectKVFileSystem, InMemoryFileSystem, type FileSystem } from "@cloudflare/worker-bundler";
import { compile } from "tailwindcss";
import twIndex from "./tw-index.css";
import appFiles from "./app-files.json";

interface Env {
	LOADER: WorkerLoader;
	PROBE: DurableObjectNamespace<Probe>;
}

const sources = appFiles as Record<string, string>;

const candidatesOf = (texts: ReadonlyArray<string>) => new Set(texts.flatMap((s) => s.split(/[^a-zA-Z0-9_\-:/[\].#%!@]+/)).filter((t) => t.length > 0 && t.length < 120));

let warm: InMemoryFileSystem | undefined;

export class Probe extends DurableObject<Env> {
	async run(mode: string): Promise<string> {
		const t0 = Date.now();
		const fs: FileSystem = mode === "kv" ? new DurableObjectKVFileSystem(this.ctx.storage) : mode === "warm" ? (warm ??= new InMemoryFileSystem({})) : new InMemoryFileSystem({});

		for (const [path, content] of Object.entries(sources)) fs.write(path, content);

		const result = await createApp({
			files: fs,
			server: "src/server.ts",
			client: "src/client.ts",
			assets: { "/index.html": "<!doctype html><div id=root></div><script type=module src=/client.js></script>" },
			minify: true,
		});

		if (mode === "kv") await fs.flush();

		const t1 = Date.now();
		const tw = await compile('@import "tailwindcss";', { loadStylesheet: async () => ({ content: twIndex, base: "/", path: "tailwindcss/index.css" }) });
		const css = tw.build([...candidatesOf(Object.values(sources))]);
		const t2 = Date.now();
		const worker = this.env.LOADER.get(`gen-${t0}`, () => ({ mainModule: result.mainModule, modules: result.modules, compatibilityDate: "2026-09-01" }));
		const res = await worker.getEntrypoint().fetch(new Request("https://x/hello"));
		const body = await res.text();
		const t3 = Date.now();
		const assets = result.assets as Record<string, string | ArrayBuffer>;
		const sizes = Object.fromEntries(Object.entries(assets).map(([k, v]) => [k, typeof v === "string" ? v.length : v.byteLength]));

		return JSON.stringify({ mode, buildMs: t1 - t0, twMs: t2 - t1, loadMs: t3 - t2, server: body, cssBytes: css.length, hasViolet: css.includes("violet-700"), sizes, fsFiles: fs.list().length });
	}
}

export default {
	async fetch(request: Request, env: Env) {
		const mode = new URL(request.url).searchParams.get("mode") ?? "memory";
		const stub = env.PROBE.get(env.PROBE.idFromName("p"));

		try {
			return new Response(await stub.run(mode));
		} catch (error) {
			return new Response(String((error as Error)?.stack ?? error), { status: 500 });
		}
	},
};

import { DurableObject } from "cloudflare:workers";
import { Effect, Option, Predicate, Result, Schema } from "effect";
import {
	BODY_CHECKS_PATH,
	BODY_HEALTH_PATH,
	BodyChecksJson,
	BodyFrame,
	type BodyState,
	BodyStateJson,
	ConversationListJson,
	type ConversationState,
	type Check,
	type Generation,
	GenerationRejected,
	GenerationStatus,
	NoSuchGeneration,
	PIN_COOKIE,
	RollbackOutcomeJson,
	ServerFrameJson,
	type ShipReport,
	ShipReportJson,
} from "../shared/protocol";
import type { Built } from "./build";
import { BuildOutcomeJson, type Builder } from "./builder";
import { cleanPath, InvalidPath } from "./paths";
import { KERNEL_FILES, SEED } from "./seed";

export type BodyEnv = { readonly LOADER: WorkerLoader; readonly BUILDER: DurableObjectNamespace<Builder> };

const MAX_FILE_BYTES = 256 * 1024;

const MAX_FILES = 400;

const CHUNK = 900_000;

const CHECK_TIMEOUT_MS = 10_000;

const COMPATIBILITY_DATE = "2026-09-01";

const READ_ONLY_PREFIX = "src/kernel/";

const HOUR_MS = 3_600_000;

const MAX_TITLE = 80;

export const BUILDER_CRASHED = "the builder failed: ";

const isRetryable = (note: string): boolean => note === INTERRUPTED || note.includes(BUILDER_CRASHED);

export const INTERRUPTED = "interrupted: the kernel restarted while this version was building, so it never went live. Ship again to rebuild it.";

const MAX_BUILDS_PER_HOUR = 30;

const writable = (path: string): Effect.Effect<string, InvalidPath> =>
	Effect.flatMap(cleanPath(path), (clean) =>
		clean.startsWith(READ_ONLY_PREFIX) ? Effect.fail(new InvalidPath({ path, reason: `${READ_ONLY_PREFIX} belongs to the kernel and is replaced on every build` })) : Effect.succeed(clean),
	);

const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const sha256 = (text: string) => Effect.promise(() => crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(hex));

const Tree = Schema.Record(Schema.String, Schema.String);

const TreeJson = Schema.fromJsonString(Tree);

const ChecksJson = Schema.fromJsonString(Schema.Array(Schema.Struct({ name: Schema.String, ok: Schema.Boolean, detail: Schema.String, ms: Schema.Number })));

const BuiltJson = Schema.fromJsonString(
	Schema.Struct({ mainModule: Schema.String, modules: Schema.Record(Schema.String, Schema.String), assets: Schema.Record(Schema.String, Schema.String), warnings: Schema.Array(Schema.String), ms: Schema.Number }),
);

const decodeStatus = Schema.decodeUnknownSync(GenerationStatus);

const encodeState = Schema.encodeSync(BodyStateJson);

const encodeReport = Schema.encodeSync(ShipReportJson);

const encodeRollback = Schema.encodeSync(RollbackOutcomeJson);

const encodeFrame = Schema.encodeSync(ServerFrameJson);

const encodeConversations = Schema.encodeSync(ConversationListJson);

const CONVERSATION_STATES: ReadonlyArray<ConversationState> = ["working", "idle", "failed"];

const conversationState = (value: string): ConversationState => CONVERSATION_STATES.find((state) => state === value) ?? "idle";

const decodeChecks = Schema.decodeUnknownSync(ChecksJson);

const encodeChecks = Schema.encodeSync(ChecksJson);

const decodeTree = Schema.decodeUnknownSync(TreeJson);

const encodeTree = Schema.encodeSync(TreeJson);

const decodeBuilt = Schema.decodeUnknownSync(BuiltJson);

const encodeBuilt = Schema.encodeSync(BuiltJson);

const decodeBodyChecks = Schema.decodeUnknownEffect(BodyChecksJson);

const decodeOutcome = Schema.decodeUnknownEffect(BuildOutcomeJson);

type Row = Record<string, SqlStorageValue>;

type GenerationRow = {
	readonly id: number;
	readonly parent: number | null;
	readonly tree: string;
	readonly treeHash: string;
	readonly message: string;
	readonly status: Generation["status"];
	readonly createdAt: number;
	readonly checks: ReadonlyArray<Check>;
	readonly boots: number;
	readonly crashes: number;
	readonly note: string;
};

const text = (row: Row, key: string): string => String(row[key] ?? "");

const num = (row: Row, key: string): number => Number(row[key] ?? 0);

const toGeneration = (row: Row): GenerationRow => ({
	id: num(row, "id"),
	parent: row["parent"] === null ? null : num(row, "parent"),
	tree: text(row, "tree"),
	treeHash: text(row, "tree_hash"),
	message: text(row, "message"),
	status: decodeStatus(text(row, "status")),
	createdAt: num(row, "created_at"),
	checks: decodeChecks(text(row, "checks") || "[]"),
	boots: num(row, "boots"),
	crashes: num(row, "crashes"),
	note: text(row, "note"),
});

const publicGeneration = (row: GenerationRow): Generation => ({
	id: row.id,
	parent: Option.fromNullishOr(row.parent),
	message: row.message,
	status: row.status,
	createdAt: row.createdAt,
	files: Object.keys(decodeTree(row.tree)).length,
	checks: row.checks,
	boots: row.boots,
	crashes: row.crashes,
	note: row.note,
});

const passedGate = (status: Generation["status"]) => status === "live" || status === "retired";

const HTML = "text/html; charset=utf-8";

const CONTENT_TYPES = new Map([
	["html", HTML],
	["js", "text/javascript; charset=utf-8"],
	["css", "text/css; charset=utf-8"],
	["json", "application/json"],
	["svg", "image/svg+xml"],
	["txt", "text/plain; charset=utf-8"],
	["webmanifest", "application/manifest+json"],
]);

const contentType = (path: string) => CONTENT_TYPES.get(path.split(".").pop() ?? "") ?? "application/octet-stream";

const pinnedGeneration = (request: Request): Option.Option<number> => {
	const cookie = request.headers.get("Cookie") ?? "";
	const match = new RegExp(`(?:^|;\\s*)${PIN_COOKIE}=(\\d+)`).exec(cookie);

	return match?.[1] === undefined ? Option.none() : Option.some(Number(match[1]));
};

const GROWING_PAGE = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Setting up your skin</title>
<link rel="icon" href="/_kernel/icon.png" type="image/png">
<body style="margin:0;min-height:100vh;display:grid;place-items:center;font:15px/1.5 system-ui,sans-serif;color:#171717;background:#fafafa">
<main style="max-width:440px;padding:32px">
<img src="/_kernel/icon.png" width="56" height="56" alt="" style="border-radius:14px">
<h1 style="font-size:22px;margin:16px 0 8px">Setting up your own skin</h1>
<p style="color:#4d4d4d;margin:0 0 20px">Everyone who signs in gets their own copy of this app, which their agent can rewrite. Yours is being built and tested now. This happens once and takes about 20 seconds.</p>
<p id="step" style="margin:0;font-weight:600">Building your app…</p>
<p id="detail" style="margin:4px 0 0;color:#737373;font-size:13px">0 s</p>
</main>
<script>
const started = Date.now();
const step = document.getElementById("step");
const detail = document.getElementById("detail");
const tick = () => fetch("/_kernel/api/body", { credentials: "same-origin" }).then((response) => response.json()).then((state) => {
	const seconds = Math.round((Date.now() - started) / 1000);
	const latest = state.generations[0];
	if (state.live !== null) { step.textContent = "Ready. Opening your app…"; location.reload(); return; }
	if (latest && latest.status === "rejected" && !latest.note.startsWith("interrupted")) {
		step.textContent = "Your app could not be built.";
		detail.innerHTML = "";
		detail.append(latest.note + " ");
		const link = document.createElement("a"); link.href = "/_kernel/"; link.textContent = "Open the console"; detail.append(link);
		return;
	}
	step.textContent = latest && latest.status === "building" ? "Building and testing your app…" : "Starting…";
	detail.textContent = seconds + " s";
	setTimeout(tick, 1500);
}).catch(() => setTimeout(tick, 3000));
tick();
</script>
</body></html>`;

const failureDetail = <E>(failure: E): string =>
	Predicate.hasProperty(failure, "detail") ? String(failure.detail) : Predicate.isTagged(failure, "TimeoutError") ? `timed out after ${CHECK_TIMEOUT_MS} ms` : String(failure);

const timed = <A, E>(name: string, effect: Effect.Effect<A, E>, describe: (value: A) => { readonly ok: boolean; readonly detail: string }) =>
	Effect.gen(function* () {
		const started = Date.now();
		const outcome = yield* Effect.result(effect.pipe(Effect.timeout(CHECK_TIMEOUT_MS)));
		const ms = Date.now() - started;

		return outcome._tag === "Success" ? { name, ms, ...describe(outcome.success) } : { name, ms, ok: false, detail: failureDetail(outcome.failure) };
	});

class CheckFailed extends Schema.TaggedError<CheckFailed>()("CheckFailed", { detail: Schema.String }) {}

export class Body extends DurableObject<BodyEnv> {
	private readonly outputs = new Map<number, Built>();

	private readonly building = new Map<string, Promise<ShipReport>>();

	constructor(ctx: DurableObjectState, env: BodyEnv) {
		super(ctx, env);
		ctx.blockConcurrencyWhile(async () => this.migrate());
	}

	private owner(): string {
		return this.ctx.id.name ?? "unnamed";
	}

	private sql(query: string, ...bindings: ReadonlyArray<SqlStorageValue>): ReadonlyArray<Row> {
		return this.ctx.storage.sql.exec(query, ...bindings).toArray();
	}

	private addColumn(table: string, column: string, definition: string): void {
		const exists = this.sql(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = ?`, column).length > 0;

		if (!exists) this.sql(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
	}

	private migrate(): void {
		this.sql("CREATE TABLE IF NOT EXISTS blobs (hash TEXT PRIMARY KEY, content TEXT NOT NULL)");
		this.sql("CREATE TABLE IF NOT EXISTS draft (path TEXT PRIMARY KEY, hash TEXT NOT NULL)");
		this.sql(
			"CREATE TABLE IF NOT EXISTS generations (id INTEGER PRIMARY KEY, parent INTEGER, tree TEXT NOT NULL, tree_hash TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, checks TEXT NOT NULL DEFAULT '[]', boots INTEGER NOT NULL DEFAULT 0, crashes INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '')",
		);
		this.sql("CREATE TABLE IF NOT EXISTS outputs (generation INTEGER NOT NULL, part INTEGER NOT NULL, chunk TEXT NOT NULL, PRIMARY KEY (generation, part))");
		this.sql("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
		this.sql("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
		this.sql("CREATE TABLE IF NOT EXISTS conversations (name TEXT PRIMARY KEY, title TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)");
		this.addColumn("conversations", "state", "TEXT NOT NULL DEFAULT 'idle'");

		this.sql("UPDATE generations SET status = 'rejected', note = ? WHERE status = 'building'", INTERRUPTED);

		const empty = this.sql("SELECT COUNT(*) AS n FROM draft")[0];
		const born = this.sql("SELECT COUNT(*) AS n FROM generations")[0];

		if (num(empty ?? {}, "n") === 0 && num(born ?? {}, "n") === 0) this.replaceDraft(SEED);
	}

	private replaceDraft(files: Readonly<Record<string, string>>): void {
		this.sql("DELETE FROM draft");

		for (const [path, content] of Object.entries(files)) this.putFile(path, content);
	}

	private putFile(path: string, content: string): void {
		const hash = this.hashSync(content);

		this.sql("INSERT OR IGNORE INTO blobs (hash, content) VALUES (?, ?)", hash, content);
		this.sql("INSERT INTO draft (path, hash) VALUES (?, ?) ON CONFLICT(path) DO UPDATE SET hash = excluded.hash", path, hash);
	}

	private hashSync(content: string): string {
		let a = 0x811c9dc5;
		let b = 0x01000193;

		for (let index = 0; index < content.length; index++) {
			const code = content.charCodeAt(index);

			a = Math.imul(a ^ code, 0x01000193) >>> 0;
			b = Math.imul(b ^ code, 0x85ebca6b) >>> 0;
		}

		return `${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}${content.length.toString(16)}`;
	}

	private draftTree(): Record<string, string> {
		return Object.fromEntries(this.sql("SELECT path, hash FROM draft ORDER BY path").map((row) => [text(row, "path"), text(row, "hash")]));
	}

	private blob(hash: string): string {
		return text(this.sql("SELECT content FROM blobs WHERE hash = ?", hash)[0] ?? {}, "content");
	}

	private resolve(tree: Readonly<Record<string, string>>): Map<string, string> {
		const files = new Map(Object.entries(tree).map(([path, hash]) => [path, this.blob(hash)]));

		for (const [path, content] of Object.entries(KERNEL_FILES)) files.set(path, content);

		return files;
	}

	private generationRows(): ReadonlyArray<GenerationRow> {
		return this.sql("SELECT * FROM generations ORDER BY id DESC LIMIT 50").map(toGeneration);
	}

	private generation(id: number): Option.Option<GenerationRow> {
		return Option.map(Option.fromNullishOr(this.sql("SELECT * FROM generations WHERE id = ?", id)[0]), toGeneration);
	}

	private liveId(): Option.Option<number> {
		return Option.map(Option.fromNullishOr(this.sql("SELECT value FROM meta WHERE key = 'live'")[0]), (row) => Number(text(row, "value")));
	}

	private stateValue(): BodyState {
		const generations = this.generationRows();
		const live = this.liveId();
		const draft = this.draftTree();
		const liveTree = Option.flatMap(live, (id) => Option.map(this.generation(id), (row) => row.tree));

		return {
			files: Object.keys(draft),
			generations: generations.map(publicGeneration),
			live,
			dirty: Option.match(liveTree, { onNone: () => true, onSome: (tree) => tree !== encodeTree(draft) }),
		};
	}

	state(): string {
		return encodeState(this.stateValue());
	}

	list(): string {
		return JSON.stringify(Object.keys(this.draftTree()));
	}

	read(path: string): string | null {
		const clean = Effect.runSync(Effect.option(cleanPath(path)));

		if (Option.isNone(clean)) return null;

		if (clean.value.startsWith(READ_ONLY_PREFIX)) return KERNEL_FILES[clean.value] ?? null;

		const row = this.sql("SELECT hash FROM draft WHERE path = ?", clean.value)[0];

		return row === undefined ? null : this.blob(text(row, "hash"));
	}

	write(path: string, content: string): string {
		return Effect.runSync(
			writable(path).pipe(
				Effect.flatMap((clean) => {
					if (new TextEncoder().encode(content).byteLength > MAX_FILE_BYTES) return Effect.fail(new InvalidPath({ path, reason: `files are limited to ${MAX_FILE_BYTES} bytes` }));

					const exists = this.sql("SELECT 1 FROM draft WHERE path = ?", clean).length > 0;

					if (!exists && Object.keys(this.draftTree()).length >= MAX_FILES) return Effect.fail(new InvalidPath({ path, reason: `the body is limited to ${MAX_FILES} files` }));

					const before = this.read(clean);

					this.putFile(clean, content);

					return Effect.succeed(before === content ? `Unchanged: ${clean}` : `Wrote ${clean}`);
				}),
				Effect.catchTag("InvalidPath", ({ reason }) => Effect.succeed(`Refused ${path}: ${reason}`)),
			),
		).concat(this.notify());
	}

	remove(path: string): string {
		return Effect.runSync(
			writable(path).pipe(
				Effect.map((clean) => {
					const existed = this.sql("SELECT 1 FROM draft WHERE path = ?", clean).length > 0;

					this.sql("DELETE FROM draft WHERE path = ?", clean);

					return existed ? `Deleted ${clean}` : `No such file: ${clean}`;
				}),
				Effect.catchTag("InvalidPath", ({ reason }) => Effect.succeed(`Refused ${path}: ${reason}`)),
			),
		).concat(this.notify());
	}

	private notify(): string {
		const frame = encodeFrame(BodyFrame.make({ body: this.stateValue() }));

		for (const socket of this.ctx.getWebSockets()) socket.send(frame);

		return "";
	}

	async ship(message: string): Promise<string> {
		const tree = this.draftTree();
		const treeJson = encodeTree(tree);
		const treeHash = await Effect.runPromise(sha256(treeJson));
		const inFlight = this.building.get(treeHash);

		if (inFlight !== undefined) return encodeReport(await inFlight);

		const same = this.sql("SELECT * FROM generations WHERE tree_hash = ? ORDER BY id DESC LIMIT 1", treeHash).map(toGeneration)[0];
		const live = this.liveId();

		if (same !== undefined && (same.status !== "building" || !this.building.has(treeHash))) {
			if (Option.contains(live, same.id)) return encodeReport({ generation: same.id, status: "unchanged", checks: same.checks, reason: "This is already the live generation." });

			if (same.status === "rejected" && !isRetryable(same.note)) return encodeReport({ generation: same.id, status: "rejected", checks: same.checks, reason: `These exact files were already rejected as generation ${same.id}: ${same.note}` });
		}

		const limited = this.buildLimit();

		if (limited !== undefined) return encodeReport({ generation: 0, status: "rejected", checks: [], reason: limited });

		this.recordBuild();

		const shipping = this.shipTree(tree, treeJson, treeHash, message).finally(() => this.building.delete(treeHash));

		this.building.set(treeHash, shipping);

		return encodeReport(await shipping);
	}

	private buildLimit(): string | undefined {
		if (this.building.size > 0) return "Another generation is building. Wait for it to finish, then ship again.";

		const since = Date.now() - HOUR_MS;
		const recent = num(this.sql("SELECT COUNT(*) AS n FROM generations WHERE created_at > ?", since)[0] ?? {}, "n");

		return recent >= MAX_BUILDS_PER_HOUR ? `This body built ${recent} generations in the last hour, the limit is ${MAX_BUILDS_PER_HOUR}. Try again later.` : undefined;
	}

	private recordBuild(): void {
		this.sql("INSERT INTO meta (key, value) VALUES ('last_build', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", String(Date.now()));
	}

	private async shipTree(tree: Record<string, string>, treeJson: string, treeHash: string, message: string): Promise<ShipReport> {
		const parent = this.liveId();
		const created = Date.now();

		const row = this.sql(
			"INSERT INTO generations (parent, tree, tree_hash, message, status, created_at) VALUES (?, ?, ?, ?, 'building', ?) RETURNING id",
			Option.getOrNull(parent),
			treeJson,
			treeHash,
			message.slice(0, 500),
			created,
		)[0];

		const id = num(row ?? {}, "id");

		this.notify();

		const files = this.resolve(tree);
		const report = await Effect.runPromise(this.buildAndGate(id, files));

		this.sql("UPDATE generations SET status = ?, checks = ?, note = ? WHERE id = ?", report.status === "live" ? "live" : "rejected", encodeChecks(report.checks), report.reason, id);

		if (report.status === "live") this.promote(id);

		this.notify();

		return report;
	}

	private buildAndGate(id: number, files: ReadonlyMap<string, string>): Effect.Effect<ShipReport> {
		return Effect.gen({ self: this }, function* () {
			const started = Date.now();
			const outcome = yield* this.callBuilder(files, id);

			if (outcome._tag === "Failed") {
				const checks = [{ name: outcome.stage, ok: false, detail: outcome.detail, ms: Date.now() - started }];

				return { generation: id, status: "rejected" as const, checks, reason: `${outcome.stage} failed: ${outcome.detail.split("\n")[0] ?? ""}` };
			}

			const output = outcome.built;
			const bundled: Check = { name: "bundle", ok: true, detail: `server and client built in ${output.ms} ms`, ms: output.ms };

			this.outputs.set(id, output);

			const worker = this.isolate(id, output);
			const health = yield* timed("boot", this.probe(worker, BODY_HEALTH_PATH), (response) => ({ ok: response.status === 200, detail: `GET ${BODY_HEALTH_PATH} returned ${response.status}` }));

			const checks = yield* timed("checks", this.bodyChecks(worker), (results) => ({
				ok: results.length > 0 && results.every((check) => check.ok),
				detail: results.length === 0 ? "the body reported no checks" : results.map((check) => `${check.ok ? "pass" : "FAIL"} ${check.name}${check.ok ? "" : `: ${check.detail}`}`).join("\n"),
			}));

			const page = output.assets["/index.html"] ?? "";
			const shell: Check = { name: "page", ok: page.includes("guard.js") && page.includes("entry.js"), detail: "index.html carries the crash guard and the client bundle", ms: 0 };
			const all = [bundled, health, checks, shell];
			const passed = all.every((check) => check.ok);

			if (passed) this.saveOutput(id, output);
			else this.outputs.delete(id);

			const firstFailure = all.find((check) => !check.ok);

			return {
				generation: id,
				status: passed ? ("live" as const) : ("rejected" as const),
				checks: all,
				reason: firstFailure === undefined ? `Generation ${id} passed every check and is live.` : `${firstFailure.name} failed: ${firstFailure.detail.split("\n")[0] ?? ""}`,
			};
		});
	}

	private callBuilder(files: ReadonlyMap<string, string>, id: number) {
		const builder = this.env.BUILDER.getByName(`${this.owner()}-build-${id}`);

		return Effect.tryPromise({ try: () => builder.build(JSON.stringify(Object.fromEntries(files)), id), catch: (cause) => String(cause) }).pipe(
			Effect.flatMap((json) => decodeOutcome(json).pipe(Effect.mapError((error) => error.message))),
			Effect.catch((detail) => Effect.succeed({ _tag: "Failed" as const, stage: "build", detail: `${BUILDER_CRASHED}${detail}` })),
		);
	}

	private probe(worker: WorkerStub, path: string): Effect.Effect<Response, CheckFailed> {
		return Effect.tryPromise({
			try: () => worker.getEntrypoint().fetch(new Request(`https://body.internal${path}`)),
			catch: (cause) => new CheckFailed({ detail: `GET ${path} threw: ${String(cause)}` }),
		});
	}

	private bodyChecks(worker: WorkerStub): Effect.Effect<ReadonlyArray<Check>, CheckFailed> {
		return this.probe(worker, BODY_CHECKS_PATH).pipe(
			Effect.flatMap((response) =>
				response.status === 200 ? Effect.promise(() => response.text()) : Effect.fail(new CheckFailed({ detail: `GET ${BODY_CHECKS_PATH} returned ${response.status}` })),
			),
			Effect.flatMap((body) => decodeBodyChecks(body).pipe(Effect.mapError((error) => new CheckFailed({ detail: `GET ${BODY_CHECKS_PATH} returned an unreadable body: ${error.message}` })))),
			Effect.map((decoded) => decoded.checks),
		);
	}

	private isolate(id: number, output: Built): WorkerStub {
		return this.env.LOADER.get(`${this.owner()}-generation-${id}`, () => ({
			mainModule: output.mainModule,
			modules: output.modules,
			compatibilityDate: COMPATIBILITY_DATE,
			compatibilityFlags: ["nodejs_compat"],
			env: { STORE: this.ctx.exports.BodyStore({ props: { user: this.owner() } }), GENERATION: String(id) },
			globalOutbound: null,
		}));
	}

	private saveOutput(id: number, output: Built): void {
		const json = encodeBuilt(output);

		this.sql("DELETE FROM outputs WHERE generation = ?", id);

		for (let part = 0; part * CHUNK < json.length; part++) this.sql("INSERT INTO outputs (generation, part, chunk) VALUES (?, ?, ?)", id, part, json.slice(part * CHUNK, (part + 1) * CHUNK));
	}

	private output(id: number): Option.Option<Built> {
		const cached = this.outputs.get(id);

		if (cached !== undefined) return Option.some(cached);

		const chunks = this.sql("SELECT chunk FROM outputs WHERE generation = ? ORDER BY part", id).map((row) => text(row, "chunk"));

		if (chunks.length === 0) return Option.none();

		const output = decodeBuilt(chunks.join(""));

		this.outputs.set(id, output);

		return Option.some(output);
	}

	private promote(id: number): void {
		this.sql("UPDATE generations SET status = 'retired' WHERE status = 'live' AND id != ?", id);
		this.sql("UPDATE generations SET status = 'live' WHERE id = ?", id);
		this.sql("INSERT INTO meta (key, value) VALUES ('live', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", String(id));
	}

	rollback(id: number): string {
		return Option.match(this.generation(id), {
			onNone: () => encodeRollback(Result.fail(new NoSuchGeneration({ generation: id }))),
			onSome: (row) => {
				if (!passedGate(row.status)) return encodeRollback(Result.fail(new GenerationRejected({ generation: id })));

				this.promote(id);
				this.replaceDraft(Object.fromEntries(Object.entries(decodeTree(row.tree)).map(([path, hash]) => [path, this.blob(hash)])));
				this.notify();

				return encodeRollback(Result.succeed(id));
			},
		});
	}

	touchConversation(name: string, firstMessage: string): void {
		const now = Date.now();
		const title = firstMessage.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE);

		this.sql("INSERT INTO conversations (name, title, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET updated_at = excluded.updated_at", name, title, now, now);
	}

	markConversation(name: string, state: ConversationState): void {
		this.sql("UPDATE conversations SET state = ?, updated_at = ? WHERE name = ?", state, Date.now(), name);
	}

	conversations(): string {
		return encodeConversations(this.conversationRows());
	}

	private conversationRows() {
		return this.sql("SELECT name, title, updated_at, state FROM conversations ORDER BY updated_at DESC LIMIT 200").map((row) => ({
			name: text(row, "name"),
			title: text(row, "title"),
			updatedAt: num(row, "updated_at"),
			state: conversationState(text(row, "state")),
		}));
	}

	forgetConversation(name: string): void {
		this.sql("DELETE FROM conversations WHERE name = ?", name);
	}

	async resetApp(): Promise<string> {
		this.replaceDraft(SEED);
		this.notify();

		return this.ship("Reset to the original app");
	}

	abortForTest(): void {
		this.ctx.abort("aborted by the local e2e");
	}

	reseed(): string {
		this.replaceDraft(SEED);
		this.notify();

		return "The draft is the factory seed again. Ship it to make it live.";
	}

	report(id: number, ok: boolean, detail: string): string {
		const row = this.generation(id);

		if (Option.isNone(row)) return "unknown generation";

		this.sql(ok ? "UPDATE generations SET boots = boots + 1 WHERE id = ?" : "UPDATE generations SET crashes = crashes + 1 WHERE id = ?", id);

		const fallback = ok || row.value.boots > 0 || !Option.contains(this.liveId(), id) ? undefined : this.previousGood(id);

		if (fallback !== undefined) {
			this.promote(fallback);
			this.sql("UPDATE generations SET status = 'rejected', note = ? WHERE id = ?", `crashed in the browser before it ever started, so the kernel rolled back to generation ${fallback}: ${detail.slice(0, 300)}`, id);
		}

		this.notify();

		return fallback === undefined ? "recorded" : `rolled back to ${fallback}`;
	}

	private previousGood(id: number): number | undefined {
		const rows = this.sql("SELECT * FROM generations WHERE id < ? AND status IN ('retired', 'live') ORDER BY (boots > 0) DESC, id DESC LIMIT 1", id).map(toGeneration);

		return rows[0]?.id;
	}

	async kvGet(key: string): Promise<string | null> {
		const row = this.sql("SELECT value FROM kv WHERE key = ?", key)[0];

		return row === undefined ? null : text(row, "value");
	}

	async kvPut(key: string, value: string): Promise<void> {
		this.sql("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key.slice(0, 512), value.slice(0, MAX_FILE_BYTES));
	}

	async kvDelete(key: string): Promise<void> {
		this.sql("DELETE FROM kv WHERE key = ?", key);
	}

	async kvList(prefix: string): Promise<ReadonlyArray<string>> {
		return this.sql("SELECT key FROM kv WHERE key >= ? AND key < ? ORDER BY key LIMIT 1000", prefix, `${prefix}\uffff`).map((row) => text(row, "key"));
	}

	private ensureBorn(): void {
		if (Option.isSome(this.liveId()) || this.building.size > 0) return;

		const latest = this.generationRows()[0];

		if (latest === undefined || latest.note === INTERRUPTED) this.ctx.waitUntil(this.ship("Seed: the first version"));
	}

	override async fetch(request: Request): Promise<Response> {
		if (request.headers.get("Upgrade") === "websocket") {
			const pair = new WebSocketPair();

			this.ctx.acceptWebSocket(pair[1]);
			pair[1].send(encodeFrame(BodyFrame.make({ body: this.stateValue() })));

			return new Response(null, { status: 101, webSocket: pair[0] });
		}

		this.ensureBorn();

		const pinned = Option.filter(pinnedGeneration(request), (id) => Option.exists(this.generation(id), (row) => passedGate(row.status)));
		const id = Option.orElse(pinned, () => this.liveId());

		if (Option.isNone(id)) return new Response(GROWING_PAGE, { status: 503, headers: { "content-type": HTML, "retry-after": "3" } });

		const output = this.output(id.value);

		if (Option.isNone(output)) return new Response(`generation ${id.value} has no saved output`, { status: 500 });

		return this.serve(request, id.value, output.value);
	}

	private serve(request: Request, id: number, output: Built): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname === "/" ? "/index.html" : url.pathname;
		const asset = output.assets[path];
		const headers = { "x-generation": String(id) };

		if (asset !== undefined && request.method === "GET") {
			const cache = path === "/index.html" ? "no-cache" : url.searchParams.has("g") ? "public, max-age=31536000, immutable" : "no-cache";

			return Promise.resolve(new Response(asset, { headers: { ...headers, "content-type": contentType(path), "cache-control": cache } }));
		}

		const wantsPage = request.method === "GET" && (request.headers.get("Accept") ?? "").includes("text/html") && !path.startsWith("/api/");

		if (wantsPage) return Promise.resolve(new Response(output.assets["/index.html"] ?? "", { headers: { ...headers, "content-type": HTML, "cache-control": "no-cache" } }));

		return this.isolate(id, output)
			.getEntrypoint()
			.fetch(request)
			.then(
				(response) => response,
				(cause: unknown) => new Response(`generation ${id} threw: ${String(cause)}`, { status: 502, headers }),
			);
	}

	override async webSocketClose(socket: WebSocket, code: number): Promise<void> {
		socket.close(code === 1005 || code === 1006 || code === 1015 ? 1000 : code, "bye");
	}
}


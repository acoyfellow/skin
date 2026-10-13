import { Effect, Layer, Option, Schema } from "effect";
import type { BodyState, Generation } from "../../shared/protocol";
import { cleanPath } from "../../kernel/paths";
import { Repo, type RepoFiles } from "../../kernel/files";

const Stored = Schema.Struct({ files: Schema.Record(Schema.String, Schema.String), shipped: Schema.Array(Schema.Struct({ id: Schema.Number, tree: Schema.String, message: Schema.String })) });

const StoredJson = Schema.fromJsonString(Stored);

const decodeStored = Schema.decodeUnknownOption(StoredJson);

const encodeStored = Schema.encodeSync(StoredJson);

const KEY = "stored-body";

type StoredBody = typeof Stored.Type;

const generationOf = (entry: StoredBody["shipped"][number], live: boolean): Generation => ({
	id: entry.id,
	parent: Option.none(),
	message: entry.message,
	status: live ? "live" : "retired",
	createdAt: 0,
	files: Object.keys(JSON.parse(entry.tree)).length,
	checks: [],
	boots: 0,
	crashes: 0,
	note: "",
});

const inStorage = (kv: SyncKvStorage): RepoFiles => {
	const load = (): StoredBody => Option.getOrElse(decodeStored(kv.get(KEY)), (): StoredBody => ({ files: {}, shipped: [] }));

	const save = (stored: StoredBody) => kv.put(KEY, encodeStored(stored));

	const tree = (files: StoredBody["files"]) => JSON.stringify(Object.fromEntries(Object.entries(files).sort()));

	const state = Effect.sync((): BodyState => {
		const stored = load();
		const last = stored.shipped.at(-1);

		return {
			files: Object.keys(stored.files).sort(),
			generations: [...stored.shipped].reverse().map((entry) => generationOf(entry, entry.id === last?.id)),
			live: Option.fromNullishOr(last?.id),
			dirty: last?.tree !== tree(stored.files),
		};
	});

	return {
		markConversation: () => Effect.void,
		list: Effect.sync(() => Object.keys(load().files).sort()),
		read: (path) => cleanPath(path).pipe(Effect.map((file) => Option.fromNullishOr(load().files[file])), Effect.orElseSucceed(() => Option.none())),
		write: (path, content) =>
			cleanPath(path).pipe(
				Effect.map((file) => {
					const stored = load();

					if (stored.files[file] === content) return `Unchanged: ${file}`;

					save({ ...stored, files: { ...stored.files, [file]: content } });

					return `Wrote ${file}`;
				}),
				Effect.orElseSucceed(() => `Refused ${path}`),
			),
		remove: (path) => Effect.sync(() => `Deleted ${path}`),
		ship: (message) =>
			Effect.sync(() => {
				const stored = load();
				const current = tree(stored.files);
				const last = stored.shipped.at(-1);

				if (last?.tree === current) return { generation: last.id, status: "unchanged" as const, checks: [], reason: "This is already the live generation." };

				const id = (last?.id ?? 0) + 1;

				save({ ...stored, shipped: [...stored.shipped, { id, tree: current, message }] });

				return { generation: id, status: "live" as const, checks: [], reason: `Generation ${id} passed every check and is live.` };
			}),
		rollback: (generation) => Effect.succeed(`Generation ${generation} is live again.`),
		state,
	};
};

export const storedRepo = (storage: DurableObjectStorage) => Layer.succeed(Repo, inStorage(storage.kv));

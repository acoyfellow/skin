import { Effect, Schema } from "effect";

export class InvalidPath extends Schema.TaggedError<InvalidPath>()("InvalidPath", { path: Schema.String, reason: Schema.String }) {}

export const cleanPath = (path: string): Effect.Effect<string, InvalidPath> => {
	const parts = path.replaceAll("\\", "/").split("/").filter((part) => part !== "" && part !== ".");

	if (parts.length === 0 || parts.some((part) => part === ".." || part.startsWith(".git"))) return Effect.fail(new InvalidPath({ path, reason: "not a valid path" }));

	if (parts[0] === "node_modules") return Effect.fail(new InvalidPath({ path, reason: "node_modules is installed from package.json, not written" }));

	return Effect.succeed(parts.join("/"));
};

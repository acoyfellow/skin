import { DurableObject } from "cloudflare:workers";
import { Effect, Schema } from "effect";
import { build } from "./build";

const Sources = Schema.Record(Schema.String, Schema.String);

const BuildOutput = Schema.Struct({
	mainModule: Schema.String,
	modules: Schema.Record(Schema.String, Schema.String),
	assets: Schema.Record(Schema.String, Schema.String),
	warnings: Schema.Array(Schema.String),
	ms: Schema.Number,
});

const Outcome = Schema.Union([
	Schema.TaggedStruct("Built", { built: BuildOutput }),
	Schema.TaggedStruct("Failed", { stage: Schema.String, detail: Schema.String }),
]);

export type BuildOutcome = typeof Outcome.Type;

export const BuildOutcomeJson = Schema.fromJsonString(Outcome);

const encodeOutcome = Schema.encodeSync(BuildOutcomeJson);

const decodeFiles = Schema.decodeUnknownSync(Schema.fromJsonString(Sources));

export class Builder extends DurableObject {
	build(filesJson: string, generation: number): Promise<string> {
		const files = new Map(Object.entries(decodeFiles(filesJson)));

		return Effect.runPromise(
			build(files, generation).pipe(
				Effect.map((built): BuildOutcome => ({ _tag: "Built", built: { ...built, warnings: [...built.warnings] } })),
				Effect.catchTag("BuildFailed", ({ stage, detail }) => Effect.succeed<BuildOutcome>({ _tag: "Failed", stage, detail })),
				Effect.map(encodeOutcome),
			),
		);
	}
}

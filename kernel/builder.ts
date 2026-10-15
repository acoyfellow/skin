import { DurableObject } from "cloudflare:workers";
import { Effect, Schema } from "effect";
import { build, type BuildPart, buildPart } from "./build";

const Sources = Schema.Record(Schema.String, Schema.String);

const BuildOutput = Schema.Struct({
	mainModule: Schema.String,
	modules: Schema.Record(Schema.String, Schema.String),
	assets: Schema.Record(Schema.String, Schema.String),
	warnings: Schema.Array(Schema.String),
	ms: Schema.Number,
});

const PartOutputSchema = Schema.Struct({
	part: Schema.Literals(["server", "client"]),
	mainModule: Schema.String,
	modules: Schema.Record(Schema.String, Schema.String),
	client: Schema.String,
	warnings: Schema.Array(Schema.String),
});

const PartOutcome = Schema.Union([
	Schema.TaggedStruct("Built", { output: PartOutputSchema }),
	Schema.TaggedStruct("Failed", { stage: Schema.String, detail: Schema.String }),
]);

export const PartOutcomeJson = Schema.fromJsonString(PartOutcome);

const encodePartOutcome = Schema.encodeSync(PartOutcomeJson);

const Outcome = Schema.Union([
	Schema.TaggedStruct("Built", { built: BuildOutput }),
	Schema.TaggedStruct("Failed", { stage: Schema.String, detail: Schema.String }),
]);

export type BuildOutcome = typeof Outcome.Type;

export const BuildOutcomeJson = Schema.fromJsonString(Outcome);

const encodeOutcome = Schema.encodeSync(BuildOutcomeJson);

const decodeFiles = Schema.decodeUnknownSync(Schema.fromJsonString(Sources));

export class Builder extends DurableObject {
	buildPart(filesJson: string, part: BuildPart): Promise<string> {
		const files = new Map(Object.entries(decodeFiles(filesJson)));

		return Effect.runPromise(
			buildPart(files, part).pipe(
				Effect.map((output): typeof PartOutcome.Type => ({ _tag: "Built", output: { ...output, warnings: [...output.warnings] } })),
				Effect.catchTag("BuildFailed", ({ stage, detail }) => Effect.succeed<typeof PartOutcome.Type>({ _tag: "Failed", stage, detail })),
				Effect.map(encodePartOutcome),
			),
		);
	}


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

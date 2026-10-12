import { Equal } from "effect";

export type RegisteredCheck = { readonly name: string; readonly run: () => void };

export type CheckResult = { readonly name: string; readonly ok: boolean; readonly detail: string; readonly ms: number };

export const checks: Array<RegisteredCheck> = [];

const scope: Array<string> = [];

export const describe = (name: string, body: () => void): void => {
	scope.push(name);
	body();
	scope.pop();
};

export const test = (name: string, run: () => void): void => {
	checks.push({ name: [...scope, name].join(" > "), run });
};

const MAX_SHOWN = 300;

const show = <A>(value: A): string => (JSON.stringify(value) ?? String(value)).slice(0, MAX_SHOWN);

type Expectation<A> = {
	readonly toBe: (expected: A) => void;
	readonly toEqual: (expected: A) => void;
};

export const expect = <A>(actual: A): Expectation<A> => ({
	toBe: (expected) => {
		if (!Object.is(actual, expected)) throw new Error(`expected ${show(expected)}, got ${show(actual)}`);
	},
	toEqual: (expected) => {
		if (!Equal.equals(actual, expected)) throw new Error(`expected ${show(expected)}, got ${show(actual)}`);
	},
});

const outcome = (check: RegisteredCheck): CheckResult => {
	const started = Date.now();

	try {
		check.run();

		return { name: check.name, ok: true, detail: "", ms: Date.now() - started };
	} catch (error) {
		return { name: check.name, ok: false, detail: error instanceof Error ? error.message : String(error), ms: Date.now() - started };
	}
};

export const runChecks = (): ReadonlyArray<CheckResult> => checks.map(outcome);

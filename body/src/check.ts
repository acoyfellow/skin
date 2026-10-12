export type RegisteredCheck = { readonly name: string; readonly run: () => void };

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

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null;

export const deepEqual = (left: unknown, right: unknown): boolean => {
	if (Object.is(left, right)) return true;

	if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((item, index) => deepEqual(item, right[index]));

	if (isRecord(left) && isRecord(right) && !Array.isArray(left) && !Array.isArray(right)) {
		const keys = Object.keys(left);

		return keys.length === Object.keys(right).length && keys.every((key) => deepEqual(left[key], right[key]));
	}

	return false;
};

const show = (value: unknown): string => {
	const json = JSON.stringify(value);

	return json === undefined ? String(value) : json.slice(0, 300);
};

class Expectation {
	constructor(private readonly actual: unknown) {}

	toBe(expected: unknown): void {
		if (!Object.is(this.actual, expected)) throw new Error(`expected ${show(expected)}, got ${show(this.actual)}`);
	}

	toEqual(expected: unknown): void {
		if (!deepEqual(this.actual, expected)) throw new Error(`expected ${show(expected)}, got ${show(this.actual)}`);
	}

	toContain(expected: unknown): void {
		const found = Array.isArray(this.actual) ? this.actual.some((item) => deepEqual(item, expected)) : String(this.actual).includes(String(expected));

		if (!found) throw new Error(`expected ${show(this.actual)} to contain ${show(expected)}`);
	}
}

export const expect = (actual: unknown): Expectation => new Expectation(actual);

export const runChecks = (): ReadonlyArray<{ readonly name: string; readonly ok: boolean; readonly detail: string; readonly ms: number }> =>
	checks.map((check) => {
		const started = Date.now();

		try {
			check.run();

			return { name: check.name, ok: true, detail: "", ms: Date.now() - started };
		} catch (error) {
			return { name: check.name, ok: false, detail: error instanceof Error ? error.message : String(error), ms: Date.now() - started };
		}
	});

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const BODY = "body";
const SKIP = [/\.test\.ts$/, /^src\/vitest-setup\.ts$/, /^src\/kernel\//, /^node_modules\//];

const walk = (dir) => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : [join(dir, name)]));

const seed = Object.fromEntries(
	walk(BODY)
		.map((path) => relative(BODY, path))
		.filter((path) => !SKIP.some((pattern) => pattern.test(path)))
		.sort()
		.map((path) => [path, readFileSync(join(BODY, path), "utf8")]),
);

const kernel = { "src/kernel/protocol.ts": readFileSync("shared/protocol.ts", "utf8") };

writeFileSync("kernel/seed.gen.json", JSON.stringify({ seed, kernel }));
console.log(`seed: ${Object.keys(seed).length} files, ${Math.round(JSON.stringify(seed).length / 1024)} KB`);

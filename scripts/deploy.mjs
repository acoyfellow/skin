import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const required = (name) => {
	const value = process.env[name];

	if (value === undefined || value === "") throw new Error(`set ${name}; see README, Deploy`);

	return value;
};

const host = required("SKIN_HOST");

const mode = process.env.SKIN_AUTH === "cloudflare" ? "cloudflare" : "access";

const authVars = mode === "cloudflare" ? { SKIN_AUTH: "cloudflare", OAUTH_CLIENT_ID: required("OAUTH_CLIENT_ID") } : { ACCESS_TEAM_DOMAIN: required("ACCESS_TEAM_DOMAIN"), ACCESS_AUD: required("ACCESS_AUD") };

const source = readFileSync("wrangler.jsonc", "utf8").replace(/^\s*\/\/.*$/gm, "");

const config = JSON.parse(source);

const zone = process.env.SKIN_ZONE;

config.routes = zone === undefined || zone === "" ? [{ pattern: host, custom_domain: true }] : [{ pattern: `${host}/*`, zone_name: zone }];

config.vars = { ...config.vars, ...authVars };

delete config.$schema;

writeFileSync("wrangler.deploy.jsonc", `${JSON.stringify(config, null, "\t")}\n`);

execFileSync("node", ["scripts/seed.mjs"], { stdio: "inherit" });

const wrangler = (args, capture = false) => execFileSync("npx", ["wrangler", ...args, "-c", "wrangler.deploy.jsonc"], { encoding: "utf8", stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit" });

const currentVersion = () => {
	const listing = wrangler(["deployments", "status"], true);

	return listing.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/)?.[1] ?? null;
};

const previous = currentVersion();

const deployed = wrangler(["deploy", ...process.argv.slice(2).filter((arg) => arg !== "--skip-smoke")], true);

process.stdout.write(deployed);

const deployedVersion = deployed.match(/Current Version ID: ([0-9a-f-]{36})/)?.[1] ?? "";

const smokeWanted = mode === "cloudflare" && !process.argv.includes("--skip-smoke");

if (smokeWanted) {
	const smoke = spawnSync("node", ["scripts/prod-smoke.mjs"], { stdio: "inherit", env: { ...process.env, SMOKE_BASE: `https://${host}`, SMOKE_EXPECT_VERSION: deployedVersion } });

	if (smoke.status !== 0) {
		if (previous === null) throw new Error("the production smoke test failed and there is no earlier version to roll back to");

		console.error(`\nThe production smoke test failed. Rolling back to ${previous}.`);
		wrangler(["rollback", previous, "--message", "prod smoke failed", "--yes"]);
		process.exit(1);
	}
}

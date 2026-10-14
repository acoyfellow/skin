import { execFileSync } from "node:child_process";
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

execFileSync("npx", ["wrangler", "deploy", "-c", "wrangler.deploy.jsonc", ...process.argv.slice(2)], { stdio: "inherit" });

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const required = (name) => {
	const value = process.env[name];

	if (value === undefined || value === "") throw new Error(`set ${name}; see README, Deploy`);

	return value;
};

const host = required("SKIN_HOST");

const teamDomain = required("ACCESS_TEAM_DOMAIN");

const audience = required("ACCESS_AUD");

const source = readFileSync("wrangler.jsonc", "utf8").replace(/^\s*\/\/.*$/gm, "");

const config = JSON.parse(source);

config.routes = [{ pattern: host, custom_domain: true }];

config.vars = { ...config.vars, ACCESS_TEAM_DOMAIN: teamDomain, ACCESS_AUD: audience };

delete config.$schema;

writeFileSync("wrangler.deploy.jsonc", `${JSON.stringify(config, null, "\t")}\n`);

execFileSync("node", ["scripts/seed.mjs"], { stdio: "inherit" });

execFileSync("npx", ["wrangler", "deploy", "-c", "wrangler.deploy.jsonc", ...process.argv.slice(2)], { stdio: "inherit" });

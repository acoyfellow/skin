import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { requestModelFor, routedAccountProvider } from "./auth/catalog";
import { placeholderFor, type RouteAccess, routedFetch } from "./auth/route";
import { SIGN_IN_FIRST, signedOutProvider } from "./model";

const SCHEME = ["Bear", "er"].join("");

const kernelSources = (dir: string): ReadonlyArray<string> =>
	readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);

		if (entry.isDirectory()) return kernelSources(path);

		return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
	});

const strip = (source: string) => source.replaceAll(/\/\/.*$/gm, "");

describe("who pays for inference", () => {
	it("the deployed Worker has no AI binding", () => {
		const config = strip(readFileSync("wrangler.jsonc", "utf8"));

		expect(config).not.toMatch(/"ai"\s*:/);
	});

	it("no kernel code reaches an AI binding or a deploy-level gateway", () => {
		const offenders = kernelSources("kernel").flatMap((path) => {
			const source = readFileSync(path, "utf8");

			return /env\.AI\b|\.AI\.run\(|createAiBindingFetch|workers-binding\.ai|SKIN_AI_GATEWAY/.test(source) ? [path] : [];
		});

		expect(offenders).toEqual([]);
	});

	it("a signed-in call carries that person's token to their own account", async () => {
		const seen: Array<{ readonly url: string; readonly authorization: string | null; readonly gateway: string | null }> = [];
		const access: RouteAccess = { accountId: "their-account", kind: "workers-ai", gateway: null, model: "@cf/zai-org/glm-5.3", token: "their-token", requestModel: requestModelFor("@cf/zai-org/glm-5.3", "workers-ai") };
		expect(routedAccountProvider(async () => access).id).toBe("skin-account");

		const call = routedFetch(async () => access, async (input, init) => {
			const request = new Request(input, init);

			seen.push({ url: request.url, authorization: request.headers.get("authorization"), gateway: request.headers.get("cf-aig-authorization") });

			return new Response("{}");
		});

		await call(`${placeholderFor("compat")}/chat/completions`, { method: "POST", headers: { authorization: `${SCHEME} someone-elses-key`, "x-api-key": "leak" }, body: "{}" });

		expect(seen).toEqual([{ url: "https://api.cloudflare.com/client/v4/accounts/their-account/ai/v1/chat/completions", authorization: `${SCHEME} their-token`, gateway: null }]);
	});

	it("an agent with no signed-in owner makes no model call and says to sign in", async () => {
		const provider = signedOutProvider();
		const [model] = provider.getModels();

		expect(model?.baseUrl).toBe("https://signed-out.skin.invalid/v1");
		expect(SIGN_IN_FIRST).toMatch(/Sign in with Cloudflare/);
	});
});

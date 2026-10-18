import { WorkerEntrypoint } from "cloudflare:workers";
import type { Body } from "./body";
import { type CloudflareAuthEnv, freshToken } from "./auth/cloudflare";
import { callCodeTool, type FileReader, fileNames, type ToolOutcome } from "./code-call";
import { accountWeb, signedOutWeb, type WebTools } from "./web";

export type CodeToolsEnv = CloudflareAuthEnv & { readonly BODY: DurableObjectNamespace<Body> };

export type CodeToolsProps = { readonly owner: string | null; readonly user: string };

export const webFor = (env: CloudflareAuthEnv, owner: string | null, send: typeof fetch): WebTools =>
	owner === null
		? signedOutWeb
		: accountWeb(async () => {
				const { grant, token } = await freshToken(env, owner, send);

				return { accountId: grant.accountId, token };
			}, send);

export class CodeTools extends WorkerEntrypoint<CodeToolsEnv, CodeToolsProps> {
	call(name: string, argsJson: string): Promise<ToolOutcome> {
		const body = this.env.BODY.getByName(this.ctx.props.user);
		const files: FileReader = { list: async () => fileNames(await body.list()).join("\n"), read: (path) => body.read(path) };

		return callCodeTool(name, argsJson, webFor(this.env, this.ctx.props.owner, fetch), files);
	}
}

import { KERNEL_PREFIX } from "../shared/protocol";

export const TOOLS_PATH = `${KERNEL_PREFIX}/api/tools`;

export const TOOL_LIST = {
	signedOut: "No tool runs without a signed-in person. Web Search and code both run on that person's own Cloudflare account.",
	tools: [
		{ name: "list_files", runsOn: "your app's draft" },
		{ name: "read_file", runsOn: "your app's draft" },
		{ name: "write_file", runsOn: "your app's draft" },
		{ name: "delete_file", runsOn: "your app's draft" },
		{ name: "ship", runsOn: "the gate: build, boot, checks" },
		{ name: "rollback", runsOn: "your app's generations" },
		{ name: "web_search", runsOn: "Cloudflare Web Search on your account, with your token" },
		{ name: "web_fetch", runsOn: "public http and https URLs only" },
		{ name: "codemode", runsOn: "a sealed Worker Loader isolate with no network; calls web_search, web_fetch, list_files, read_file" },
	],
} as const;

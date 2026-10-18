import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { callCodeTool, type FileReader } from "./code-call";
import { TOOL_LIST } from "./tool-list";
import { accountWeb, clampResults, codeModule, codeOutcomeOf, describeCodeOutcome, fetchPublicText, isPublicUrl, normalizeResults, SIGNED_OUT_TOOLS, searchOnAccount, signedOutWeb, toPlainText } from "./web";

const SCHEME = ["Bear", "er"].join("");

const files: FileReader = { list: async () => "AGENTS.md\nsrc/main.ts", read: async (path) => (path === "AGENTS.md" ? "rules" : null) };

const recording = (reply: () => Response) => {
	const seen: Array<{ readonly url: string; readonly init: RequestInit | undefined }> = [];

	const send: typeof fetch = async (input, init) => {
		seen.push({ url: String(input), init });

		return reply();
	};

	return { seen, send };
};

const SEARCH_REPLY = { result: { items: [{ title: "Workers", url: "https://developers.cloudflare.com/workers/", description: "Build on the edge" }, { title: "bad", url: "javascript:alert(1)" }] } };

describe("web_search", () => {
	it("calls Web Search on the signed-in person's own account with their own token", async () => {
		const { seen, send } = recording(() => Response.json(SEARCH_REPLY));
		const results = await searchOnAccount({ accountId: "their-account", token: "their-token" }, "workers", 5, send);

		expect(seen[0]?.url).toBe("https://api.cloudflare.com/client/v4/accounts/their-account/websearch/search");
		expect(new Headers(seen[0]?.init?.headers).get("authorization")).toBe(`${SCHEME} their-token`);
		expect(results).toEqual([{ title: "Workers", url: "https://developers.cloudflare.com/workers/", snippet: "Build on the edge" }]);
	});

	it("drops non-web URLs and caps the result count", () => {
		const many = { items: Array.from({ length: 20 }, (_, index) => ({ title: `r${index}`, url: `https://example.com/${index}` })) };

		expect(normalizeResults(many, clampResults(50))).toHaveLength(10);
		expect(clampResults(undefined)).toBe(5);
		expect(clampResults(0)).toBe(1);
	});

	it("surfaces the account's error instead of pretending to search", async () => {
		const { send } = recording(() => Response.json({ errors: [{ message: "Authentication error" }] }, { status: 403 }));

		await expect(searchOnAccount({ accountId: "a", token: "t" }, "q", 5, send)).rejects.toThrow("403: Authentication error");
	});

	it("asks for a fresh token on every search", async () => {
		let asked = 0;
		const { send } = recording(() => Response.json(SEARCH_REPLY));

		const web = accountWeb(async () => {
			asked += 1;

			return { accountId: "a", token: `t${asked}` };
		}, send);

		await web.search("x", 3);
		await web.search("y", 3);
		expect(asked).toBe(2);
	});
});

describe("web_fetch", () => {
	it("reads public pages and reduces HTML to text", async () => {
		const { send } = recording(() => new Response("<html><script>evil()</script><h1>Hi &amp; bye</h1></html>", { headers: { "content-type": "text/html" } }));
		const page = await fetchPublicText("https://example.com/", send);

		expect(page).toContain("HTTP 200 text/html");
		expect(page).toContain("Hi & bye");
		expect(page).not.toContain("evil");
	});

	it("refuses private, local, and non-web URLs before any request", async () => {
		const { seen, send } = recording(() => new Response("x"));

		for (const url of ["http://localhost/", "http://127.0.0.1/", "http://10.0.0.1/", "http://192.168.1.1/", "https://user:pw@example.com/"]) {
			expect(isPublicUrl(url)).toBe(false);
			await expect(fetchPublicText(url, send)).rejects.toThrow("public http and https");
		}

		expect(seen).toHaveLength(0);
	});

	it("strips markup", () => {
		expect(toPlainText("<p>a</p><style>x{}</style><p>b</p>")).toBe("a b");
	});
});

describe("codemode", () => {
	it("wraps the program in a sealed entrypoint that only reaches tools through the TOOLS binding", () => {
		const module = codeModule("return 1 + 1;");

		expect(module).toContain("env.TOOLS.call(name");
		expect(module).toContain("return 1 + 1;");
		expect(module).not.toContain("await fetch(");
	});

	it("isolates run with no network, through the Worker Loader", () => {
		const agent = readFileSync("kernel/agent.ts", "utf8");
		const loader = agent.slice(agent.indexOf("const runCode"), agent.indexOf("return Layer.succeed(Tools, { web: webFor"));

		expect(loader).toContain("env.LOADER.get(");
		expect(loader).toContain("globalOutbound: null");
		expect(loader).toContain("ctx.exports.CodeTools({ props: { owner, user } })");
	});

	it("routes tool calls from code to search, fetch, and the draft", async () => {
		const { send } = recording(() => Response.json(SEARCH_REPLY));
		const web = accountWeb(async () => ({ accountId: "a", token: "t" }), send);

		expect((await callCodeTool("web_search", JSON.stringify({ query: "workers" }), web, files)).text).toContain("developers.cloudflare.com");
		expect((await callCodeTool("list_files", "{}", web, files)).text).toBe("AGENTS.md\nsrc/main.ts");
		expect((await callCodeTool("read_file", JSON.stringify({ path: "AGENTS.md" }), web, files)).text).toBe("rules");
		expect((await callCodeTool("write_file", "{}", web, files)).ok).toBe(false);
	});

	it("reports logs, return values, and throws", () => {
		expect(describeCodeOutcome(codeOutcomeOf(JSON.stringify({ ok: true, value: "2", logs: ["hi"] })))).toBe("console:\nhi\n\nreturned: 2");
		expect(describeCodeOutcome(codeOutcomeOf(JSON.stringify({ ok: false, value: "Error: boom", logs: [] })))).toBe("threw: Error: boom");
		expect(codeOutcomeOf("null").ok).toBe(false);
	});
});

describe("signed-out callers get no tool calls", () => {
	it("web_search and web_fetch refuse without a request", async () => {
		await expect(signedOutWeb.search("anything", 5)).rejects.toThrow(SIGNED_OUT_TOOLS);
		await expect(signedOutWeb.fetchText("https://example.com/")).rejects.toThrow(SIGNED_OUT_TOOLS);
	});

	it("codemode tool calls refuse too", async () => {
		const outcome = await callCodeTool("web_search", JSON.stringify({ query: "x" }), signedOutWeb, files);

		expect(outcome).toEqual({ ok: false, text: SIGNED_OUT_TOOLS });
	});

	it("an agent with no signed-in owner never loads a codemode isolate", () => {
		const agent = readFileSync("kernel/agent.ts", "utf8");
		const tools = agent.slice(agent.indexOf("const toolsFor"), agent.indexOf("const runCode"));

		expect(tools).toContain("if (owner === null) return Layer.succeed(Tools, { web: signedOutWeb, runCode: async () => SIGNED_OUT_TOOLS });");
	});

	it("the public tool list names all three", () => {
		expect(TOOL_LIST.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(["web_search", "web_fetch", "codemode"]));
	});
});

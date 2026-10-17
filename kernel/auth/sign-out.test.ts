import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const header = readFileSync("body/src/view/index.ts", "utf8");

const settings = readFileSync("kernel/command-center.ts", "utf8");

const kernel = readFileSync("kernel/auth/cloudflare.ts", "utf8");

describe("signing out", () => {
	it("is a POST form to /oauth/logout in the app header", () => {
		expect(header).toContain('h.Method("post"), h.Action("/oauth/logout")');
		expect(header).toContain('["Sign out"]');
	});

	it("is a POST form to /oauth/logout in the Cmd+K command center", () => {
		expect(settings).toContain('el("form", { method: "post", action: "/oauth/logout"');
	});

	it("ends the session on the server and revokes the grant", () => {
		const logout = kernel.slice(kernel.indexOf("const logout = async"), kernel.indexOf("const settings = async"));

		expect(logout).toContain("closeSession(session.id)");
		expect(logout).toContain("revoke(");
		expect(logout).toContain("dropGrant(session.owner)");
		expect(logout).toContain("clearCookie(jar, jar.session)");
	});

	it("answers only POST, so a link or a prefetch cannot sign anyone out", () => {
		expect(kernel).toContain('pathname === "/oauth/logout" && request.method === "POST"');
	});
});

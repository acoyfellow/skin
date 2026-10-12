import { defineConfig } from "vitest/config";

const inlineFoldkit = { deps: { inline: ["foldkit"] } };

export default defineConfig({
	test: {
		projects: [
			{ test: { name: "client", environment: "happy-dom", include: ["body/src/**/*.test.ts"], setupFiles: ["./body/src/vitest-setup.ts"], server: inlineFoldkit } },
			{ test: { name: "server", environment: "node", include: ["kernel/**/*.test.ts", "shared/**/*.test.ts", "test/**/*.test.ts"], server: inlineFoldkit } },
		],
	},
});

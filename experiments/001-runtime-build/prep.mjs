import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
const files = {};
for (const p of ["src/client.ts", "src/server.ts", "package.json"]) files[p] = readFileSync(`app/${p}`, "utf8");
writeFileSync("src/app-files.json", JSON.stringify(files));
copyFileSync("node_modules/tailwindcss/index.css", "src/tw-index.css");

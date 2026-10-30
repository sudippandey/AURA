import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(root, "dist");
const files = ["index.html", "runtime-config.js"];
const apiBaseUrl = process.env.API_BASE_URL ?? "";

if (apiBaseUrl && !/^https?:\/\/[^/]+(?:\/api\/v1)?\/?$/i.test(apiBaseUrl)) {
  throw new Error("API_BASE_URL must be an HTTP(S) origin, optionally ending in /api/v1.");
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of files) await cp(path.join(root, file), path.join(output, file));
await cp(path.join(root, "src"), path.join(output, "src"), { recursive: true });

await writeFile(
  path.join(output, "runtime-config.js"),
  `window.__API_BASE_URL = ${JSON.stringify(apiBaseUrl)};\n`
);

const htmlPath = path.join(output, "index.html");
const html = await readFile(htmlPath, "utf8");
if (!html.includes('<script src="./runtime-config.js"></script>')) {
  throw new Error("index.html must load runtime-config.js before the app module.");
}

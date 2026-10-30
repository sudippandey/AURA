import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(backendRoot, "src", "docs", "openapi.yaml");
const destination = join(backendRoot, "dist", "docs", "openapi.yaml");

await mkdir(dirname(destination), { recursive: true });
await copyFile(source, destination);

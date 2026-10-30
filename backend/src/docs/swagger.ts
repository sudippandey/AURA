import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import YAML from "yamljs";

const here = dirname(fileURLToPath(import.meta.url));

/** Load the OpenAPI document. Throws with a clear message if it is missing. */
export function loadSwaggerDocument(): Record<string, unknown> {
  const path = join(here, "openapi.yaml");
  try {
    return YAML.load(path) as Record<string, unknown>;
  } catch {
    throw new Error(`[swagger] Could not load OpenAPI file at ${path}`);
  }
}

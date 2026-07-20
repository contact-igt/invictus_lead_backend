import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const backendClientKeyUrl = new URL("../utils/clientKey.js", import.meta.url);
const frontendClientKeyUrl = new URL(
  "../../../frontend/src/utils/clientKey.ts",
  import.meta.url,
);

const [backendSource, frontendSource] = await Promise.all([
  readFile(fileURLToPath(backendClientKeyUrl), "utf8"),
  readFile(fileURLToPath(frontendClientKeyUrl), "utf8"),
]);

const extractStringArray = (source, constantName) => {
  const match = source.match(
    new RegExp(
      `export\\s+const\\s+${constantName}[^=]*=\\s*\\[([\\s\\S]*?)\\]`,
    ),
  );
  assert.ok(match, `Unable to find ${constantName}`);
  return [...match[1].matchAll(/["']([^"']+)["']/g)].map(
    (entry) => entry[1],
  );
};

const extractAliasMap = (source) => {
  const match = source.match(
    /export\s+const\s+CLIENT_KEY_ALIASES[^=]*=\s*{([\s\S]*?)};/,
  );
  assert.ok(match, "Unable to find CLIENT_KEY_ALIASES");

  return Object.fromEntries(
    [...match[1].matchAll(/([a-z0-9_]+)\s*:\s*["']([^"']+)["']/g)].map(
      (entry) => [entry[1], entry[2]],
    ),
  );
};

assert.deepEqual(
  extractStringArray(frontendSource, "SUPPORTED_CLIENT_MODULES"),
  extractStringArray(backendSource, "SUPPORTED_CLIENT_MODULES"),
  "Frontend and backend supported client modules must match",
);

assert.deepEqual(
  extractAliasMap(frontendSource),
  extractAliasMap(backendSource),
  "Frontend and backend client-key aliases must match",
);

console.log("Frontend/backend client module parity checks passed.");

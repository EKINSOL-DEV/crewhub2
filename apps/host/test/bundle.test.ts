/**
 * The key never reaches the browser: the browser code (the world and the loops client) names no key file, no
 * `Authorization` and no `Bearer`, and neither does the built bundle when it exists. A test can only prove the
 * absence of what it can name, so it greps for the names around the key, not for a key.
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const BROWSER_ROOTS = ["apps/world/src", "packages/loops-client/src"];
const DIST = "apps/world/dist";
const FORBIDDEN = ["CREWHUB_WORLD_KEY_FILE", "agent-crewhub-world.key", "agent-builder.key", "Authorization", "Bearer "];
const SOURCE = /\.(ts|tsx|js|mjs|html|css|json|map)$/;

async function* walk(directory: string): AsyncGenerator<string> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (SOURCE.test(entry.name)) yield full;
  }
}

async function offenders(directory: string): Promise<string[]> {
  const found: string[] = [];
  for await (const file of walk(directory)) {
    const text = await readFile(file, "utf8");
    for (const word of FORBIDDEN) if (text.includes(word)) found.push(`${path.relative(root, file)}: ${word}`);
  }
  return found;
}

describe("the key stays out of the browser", () => {
  it("the browser code names no key file, no Authorization header and no Bearer token", async () => {
    let scanned = 0;
    for (const dir of BROWSER_ROOTS) {
      const full = path.join(root, dir);
      assert.ok(existsSync(full), `${dir} exists`);
      for await (const _ of walk(full)) scanned += 1;
      assert.deepEqual(await offenders(full), [], dir);
    }
    assert.ok(scanned > 10, "scanned the browser code");
  });

  it("the built bundle (apps/world/dist) holds none of them either", async (t) => {
    const dist = path.join(root, DIST);
    if (!existsSync(dist)) {
      t.diagnostic(`${DIST} is absent (run npm run build); the bundle check was skipped`);
      return;
    }
    assert.deepEqual(await offenders(dist), []);
  });
});

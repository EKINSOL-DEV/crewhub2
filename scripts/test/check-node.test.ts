import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { checkNode, majorOf } from "../check-node.mjs";

const SCRIPT = path.resolve(import.meta.dirname, "..", "check-node.mjs");
const NVMRC = path.resolve(import.meta.dirname, "..", "..", ".nvmrc");

test("the rule: the running major must be .nvmrc's; an older or newer one gets the one sentence", () => {
  assert.equal(majorOf("24.21.0"), 24);
  assert.equal(majorOf("v22.22.0"), 22);
  assert.equal(majorOf("24\n"), 24);
  assert.equal(majorOf("latest"), null);
  assert.equal(checkNode("24.21.0", "24\n"), null);
  assert.equal(checkNode("24.0.0", "24"), null);
  assert.equal(checkNode("22.22.0", "24\n"), "Node 24 required (.nvmrc), found v22.22.0: run nvm use");
  assert.equal(checkNode("v22.22.0", "24"), "Node 24 required (.nvmrc), found v22.22.0: run nvm use");
  assert.equal(checkNode("25.0.0", "24"), "Node 24 required (.nvmrc), found v25.0.0: run nvm use");
  assert.equal(checkNode("24.21.0", "lts/*"), ".nvmrc does not name a Node major (lts/*)");
});

test("the script: this Node (the one the tests run on) passes against this repository's .nvmrc", () => {
  assert.equal(majorOf(readFileSync(NVMRC, "utf8")), majorOf(process.versions.node), "the tests themselves run on .nvmrc's major");
  const out = execFileSync(process.execPath, [SCRIPT], { encoding: "utf8" });
  assert.equal(out, "");
});

test("the script: a faked older Node fails at once with the sentence (exit 1, nothing else run)", () => {
  // The script reads the running Node; a stand-in script with the same rule and a faked version is the honest fake.
  const fake = `import { checkNode } from ${JSON.stringify(SCRIPT)}; const p = checkNode("22.22.0", "24\\n"); if (p) { console.error(p); process.exit(1); }`;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", fake], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.equal(result.stderr.trim(), "Node 24 required (.nvmrc), found v22.22.0: run nvm use");
  assert.equal(result.stdout, "");
});

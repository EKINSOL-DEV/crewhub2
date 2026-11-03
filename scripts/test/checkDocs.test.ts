/* `npm run check:docs` (scripts/check-docs.mjs) checks the repository's Markdown, not the tools' output (round 53,
   review CI6): `tools/out/` is git-ignored and holds whole copies of older trees from the tools' builds, so a link there
   may point anywhere. The script finds its root from its own place, so the test runs a copy of it in a tree of its own. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("../check-docs.mjs", import.meta.url));

function run(files: Record<string, string>): { status: number | null; out: string } {
  const root = mkdtempSync(path.join(tmpdir(), "check-docs-"));
  try {
    mkdirSync(path.join(root, "scripts"));
    copyFileSync(SCRIPT, path.join(root, "scripts", "check-docs.mjs"));
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), text);
    }
    const result = spawnSync(process.execPath, [path.join(root, "scripts", "check-docs.mjs")], { encoding: "utf8" });
    return { status: result.status, out: `${result.stdout}${result.stderr}` };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("a broken link in the repository's Markdown fails; one under tools/out is not the repository's", () => {
  const broken = run({ "README.md": "[gone](docs/gone.md)\n" });
  assert.equal(broken.status, 1, broken.out);
  assert.match(broken.out, /README\.md: missing link target docs\/gone\.md/);

  const output = run({ "README.md": "[here](docs/here.md)\n", "docs/here.md": "# here\n", "tools/out/build-0000000/docs/old.md": "[gone](nowhere.md)\n" });
  assert.equal(output.status, 0, output.out);
  assert.match(output.out, /checked in 2 Markdown documents/);

  const elsewhere = run({ "docs/out/notes.md": "[gone](nowhere.md)\n" });
  assert.equal(elsewhere.status, 1, "only tools/out is skipped, not every folder named out");
});

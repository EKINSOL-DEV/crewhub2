/* The copies' own half of the sync rule needs no crewhub-loops checkout (round 53, review CI5): a listed copy that is
   missing, has no header, or names another source fails on every machine, CI included, where the comparison with the
   source is skipped. A whole, well-headed copy without a checkout is still a skip. */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { checkCopies } from "../bubbles-copy.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/bubbles-copy/${name}`, import.meta.url), "utf8");
const SOURCE_PATH = "apps/web/src/components/bubbles/queries.ts";

test("without a crewhub-loops checkout, a missing copy, a lost header or another source path still fails", () => {
  const repo = mkdtempSync(path.join(tmpdir(), "bubbles-copy-"));
  try {
    const absent = path.join(repo, "no-loops-here");
    const copies = [{ copy: "queries.ts", source: SOURCE_PATH }];
    const write = (text: string) => writeFileSync(path.join(repo, "queries.ts"), text);

    write(fixture("copy.txt"));
    assert.equal(checkCopies(repo, absent, copies).status, "skipped", "a whole copy: nothing to compare it with here");

    write(fixture("source.txt"));
    const headless = checkCopies(repo, absent, copies);
    assert.equal(headless.status, "failed");
    assert.match(headless.messages[0] ?? "", /queries\.ts: the first line is not the "Source: crewhub-loops/);

    write(fixture("copy.txt").replace(SOURCE_PATH, "apps/web/src/other.ts"));
    assert.match(checkCopies(repo, absent, copies).messages[0] ?? "", /the header names apps\/web\/src\/other\.ts, expected/);

    assert.deepEqual(checkCopies(repo, absent, [{ copy: "gone.ts", source: SOURCE_PATH }]), { status: "failed", messages: ["gone.ts: missing"] });
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

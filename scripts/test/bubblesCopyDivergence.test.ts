/* A declared divergence of a loops copy (round 69, w5-9 and w5-10): a copy may carry exact, recorded edits that loops has not
   taken yet (docs/proposals/loops-dock-input.md). `checkCopies` applies each record to the source text before it compares, so
   the copy must equal the source with the records applied, and nothing else: any other edit still fails, a record whose text
   is not in the source (once) fails, and a verbatim copy under a record fails too, so the record and the copy never drift. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { checkCopies, compareCopy } from "../bubbles-copy.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/bubbles-copy/${name}`, import.meta.url), "utf8");
const SOURCE_PATH = "apps/web/src/components/bubbles/queries.ts";
const RECORD = { why: "a test's divergence", from: "queryFn: () => []", to: "queryFn: () => [1]" };

test("compareCopy takes the records into account, and names a record the source does not hold once", () => {
  const copy = fixture("copy.txt");
  const source = fixture("source.txt");
  const diverged = copy.replace(RECORD.from, RECORD.to);
  assert.deepEqual(compareCopy("queries.ts", diverged, SOURCE_PATH, source, [RECORD]), []);
  assert.match(compareCopy("queries.ts", copy, SOURCE_PATH, source, [RECORD])[0] ?? "", /differs from crewhub-loops .* at line 7 of the copy/, "a verbatim copy under a record");
  assert.match(compareCopy("queries.ts", diverged.replace('["dm-threads"]', '["threads"]'), SOURCE_PATH, source, [RECORD])[0] ?? "", /at line 4 of the copy/, "another edit beside the record");
  const absent = { why: "stale", from: "nothing like this", to: "x" };
  assert.deepEqual(compareCopy("queries.ts", diverged, SOURCE_PATH, source, [RECORD, absent]), [
    'queries.ts: the declared divergence "stale" is not in crewhub-loops apps/web/src/components/bubbles/queries.ts @ a1bed0f (found 0 times, expected once): loops took it or moved the line; re-copy the file and drop the record',
  ]);
  const twice = { why: "ambiguous", from: "threads", to: "chats" };
  assert.match(compareCopy("queries.ts", diverged, SOURCE_PATH, source, [twice])[0] ?? "", /"ambiguous" is not in .* \(found \d+ times, expected once\)/);
});

test("checkCopies applies a copy's records to the source at the recorded commit; any other edit still fails", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "bubbles-copy-div-"));
  try {
    const loops = path.join(dir, "loops");
    const repo = path.join(dir, "repo");
    mkdirSync(path.join(loops, "apps/web/src/components/bubbles"), { recursive: true });
    writeFileSync(path.join(loops, SOURCE_PATH), fixture("source.txt"));
    const git = (...args: string[]) =>
      execFileSync("git", ["-C", loops, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" }).trim();
    git("init", "-q");
    git("add", ".");
    git("commit", "-q", "-m", "source");
    const commit = git("rev-parse", "--short=7", "HEAD");
    const copies = [{ copy: "queries.ts", source: SOURCE_PATH, divergences: [RECORD] }];
    mkdirSync(repo);
    const headed = fixture("copy.txt").replace("@ a1bed0f.", `@ ${commit}.`);
    const write = (text: string) => writeFileSync(path.join(repo, "queries.ts"), text);

    write(headed.replace(RECORD.from, RECORD.to));
    const ok = checkCopies(repo, loops, copies);
    assert.equal(ok.status, "ok", ok.messages.join("\n"));
    assert.match(ok.messages[0] ?? "", /1 declared divergence/);

    write(headed.replace(RECORD.from, RECORD.to).replace('["dm-threads"]', '["threads"]'));
    const other = checkCopies(repo, loops, copies);
    assert.equal(other.status, "failed");
    assert.match(other.messages[0] ?? "", /at line 4 of the copy/);

    write(headed);
    assert.equal(checkCopies(repo, loops, copies).status, "failed", "a verbatim copy while a record stands");

    // Without records the old rule holds unchanged: the diverged copy fails.
    write(headed.replace(RECORD.from, RECORD.to));
    assert.equal(checkCopies(repo, loops, [{ copy: "queries.ts", source: SOURCE_PATH }]).status, "failed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { checkCopies, compareCopy, parseCopy } from "../bubbles-copy.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/bubbles-copy/${name}`, import.meta.url), "utf8");
const SOURCE_PATH = "apps/web/src/components/bubbles/queries.ts";

test("a copy is its source plus one header line naming the source and the commit", () => {
  const copy = fixture("copy.txt");
  const source = fixture("source.txt");
  assert.deepEqual(parseCopy(copy), { sourcePath: SOURCE_PATH, commit: "a1bed0f", body: source });
  assert.deepEqual(compareCopy("queries.ts", copy, SOURCE_PATH, source), []);
});

test("an edit, a missing header or another source path fails with where it differs", () => {
  const copy = fixture("copy.txt");
  const source = fixture("source.txt");
  const edited = copy.replace('["dm-threads"]', '["threads"]');
  assert.deepEqual(compareCopy("queries.ts", edited, SOURCE_PATH, source), [
    `queries.ts: differs from crewhub-loops ${SOURCE_PATH} @ a1bed0f at line 4 of the copy (line 3 of the source)`,
  ]);
  assert.match(compareCopy("queries.ts", source, SOURCE_PATH, source)[0] ?? "", /first line is not the "Source: crewhub-loops/);
  assert.match(compareCopy("queries.ts", copy, "apps/web/src/other.ts", source)[0] ?? "", /the header names .*queries\.ts, expected apps\/web\/src\/other\.ts/);
  const css = `/* Source: crewhub-loops apps/web/x.css @ a1bed0f. Copied verbatim; do not edit here, change the source and re-copy. */\n.a {}\n`;
  assert.deepEqual(compareCopy("x.css", css, "apps/web/x.css", ".a {}\n"), []);
});

test("checkCopies reads the source at the recorded commit, and skips without a checkout or the commit", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "bubbles-copy-"));
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
    const copies = [{ copy: "queries.ts", source: SOURCE_PATH }];
    mkdirSync(repo);
    const write = (text: string) => writeFileSync(path.join(repo, "queries.ts"), text);

    write(fixture("copy.txt").replace("@ a1bed0f.", `@ ${commit}.`));
    assert.equal(checkCopies(repo, loops, copies).status, "ok");

    // The source moves on: the copy still matches its recorded commit, with a note to re-copy.
    writeFileSync(path.join(loops, SOURCE_PATH), `${fixture("source.txt")}// newer\n`);
    git("commit", "-qam", "newer");
    const moved = checkCopies(repo, loops, copies);
    assert.equal(moved.status, "ok");
    assert.match(moved.messages.join("\n"), /changed in crewhub-loops after/);

    write(fixture("copy.txt").replace("@ a1bed0f.", `@ ${commit}.`).replace("queryFn: () => []", "queryFn: () => [1]"));
    const failed = checkCopies(repo, loops, copies);
    assert.equal(failed.status, "failed");
    assert.match(failed.messages[0] ?? "", /differs from crewhub-loops .* at line 7 of the copy/);

    write(fixture("copy.txt").replace("@ a1bed0f.", "@ 0000000."));
    assert.equal(checkCopies(repo, loops, copies).status, "skipped", "a checkout without the recorded commit");
    assert.equal(checkCopies(repo, path.join(dir, "absent"), copies).status, "skipped", "no checkout at all");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

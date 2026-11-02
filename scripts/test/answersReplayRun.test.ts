/* tools/answers-replay.mjs run as a program (round 50, r48-review F11): a merge that fails for a reason other than a
   conflict (here a branch git does not know) ends with a plain line naming the branch and git's own reason, exit 1,
   and no stack from `git commit`. The test makes a small git repository in the system's temp folder, with git's global
   and system config left out and its own author, runs the tool there, and removes the folder. */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const tool = fileURLToPath(new URL("../../tools/answers-replay.mjs", import.meta.url));

test("answers-replay: a merge that fails without a conflict (an unknown branch) says so plainly and exits 1, no stack", (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "answers-replay-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const empty = path.join(dir, "gitconfig");
  writeFileSync(empty, "");
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: empty,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "test",
    GIT_AUTHOR_EMAIL: "test@example.invalid",
    GIT_COMMITTER_NAME: "test",
    GIT_COMMITTER_EMAIL: "test@example.invalid",
  };
  const repo = path.join(dir, "repo");
  execFileSync("git", ["init", "-q", "-b", "main", repo], { env });
  writeFileSync(path.join(repo, "README.md"), "base\n");
  execFileSync("git", ["add", "README.md"], { cwd: repo, env });
  execFileSync("git", ["commit", "-q", "-m", "base"], { cwd: repo, env });

  // q3's branch (task/q3-health-less) does not exist in this repository.
  const run = spawnSync(process.execPath, [tool, "main", "cookie", "q3"], { cwd: repo, env, encoding: "utf8" });
  assert.equal(run.status, 1, `exit 1, got ${run.status}; stderr: ${run.stderr}`);
  assert.match(run.stderr, /^answers-replay: the merge of task\/q3-health-less failed without a conflict: .*not something we can merge.*: a person must look/m, run.stderr);
  assert.doesNotMatch(run.stderr, /^\s+at /m, "no stack trace");
  assert.doesNotMatch(run.stderr, /Command failed/, "no execFileSync error");
  assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: repo, env, encoding: "utf8" }), "", "the tree is as it was");
});

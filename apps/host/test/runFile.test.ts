import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { readRunFile, runFilePath } from "../src/runFile.ts";

const RUN_FILE_TS = fileURLToPath(new URL("../src/runFile.ts", import.meta.url));

describe("the run file", () => {
  it("is read by port from the user's temp folder; a missing, unreadable or misshapen file is none", () => {
    assert.equal(runFilePath(5194), path.join(tmpdir(), "crewhub-world-host-5194.json"));
    assert.equal(readRunFile(1), null, "no host on port 1");
    // A file of the right shape elsewhere: the reader takes the path from the port, so this one is read through TMPDIR.
    const dir = mkdtempSync(path.join(tmpdir(), "crewhub-run-"));
    const before = process.env["TMPDIR"];
    process.env["TMPDIR"] = dir;
    try {
      assert.equal(readRunFile(65000), null);
      writeFileSync(runFilePath(65000), "not json");
      assert.equal(readRunFile(65000), null);
      writeFileSync(runFilePath(65000), JSON.stringify({ pid: 1, url: "http://127.0.0.1:65000" }));
      assert.equal(readRunFile(65000), null, "no secret, no file");
      writeFileSync(runFilePath(65000), JSON.stringify({ pid: 1, url: "http://127.0.0.1:65000", mintSecret: "s3cret" }));
      assert.deepEqual(readRunFile(65000), { pid: 1, url: "http://127.0.0.1:65000", mintSecret: "s3cret" });
    } finally {
      if (before === undefined) delete process.env["TMPDIR"];
      else process.env["TMPDIR"] = before;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Round 50 (r48-review F16): main.ts removed the file only in its SIGINT/SIGTERM handler, so `npm run world`'s failed
  // build (`process.exit(1)`) or an uncaught error left it behind. `writeRunFile` removes it at any exit of the process.
  // A child process writes it through TMPDIR (a folder of the test's own) and ends each way; the file must be gone.
  for (const [how, end] of [
    ["process.exit(1), as after a failed build", "process.exit(1);"],
    ["an uncaught error", "throw new Error('boom');"],
  ] as const)
    it(`is removed when the host ends by ${how}, and is there while it runs`, () => {
      const dir = mkdtempSync(path.join(tmpdir(), "crewhub-run-exit-"));
      try {
        const script = [
          `import { existsSync } from "node:fs";`,
          `import { runFilePath, writeRunFile } from ${JSON.stringify(RUN_FILE_TS)};`,
          `writeRunFile(65001, { pid: process.pid, url: "http://127.0.0.1:65001", mintSecret: "s3cret" });`,
          `console.log(existsSync(runFilePath(65001)) ? "written" : "missing");`,
          end,
        ].join("\n");
        const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], { env: { ...process.env, TMPDIR: dir }, encoding: "utf8" });
        assert.equal(child.stdout.trim(), "written", `the child wrote it: ${child.stderr}`);
        assert.notEqual(child.status, 0, "the child ended with a failure");
        assert.equal(existsSync(path.join(dir, "crewhub-world-host-65001.json")), false, "the run file is gone");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
});

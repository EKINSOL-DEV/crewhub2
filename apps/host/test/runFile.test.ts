import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { readRunFile, runFilePath } from "../src/runFile.ts";

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
    }
  });
});

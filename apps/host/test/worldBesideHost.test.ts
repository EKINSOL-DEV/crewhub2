/* Design choice H2 (round 72, `refuse`): `npm run world` beside a running `npm run host`. The run file says whether the
   host on the port serves the built world (`world: true` for `npm run world`, false for the development host, which
   serves no built world); `world` then opens nothing on a development host, says what to do and exits 1, instead of
   opening the browser on a JSON error page. A host someone started is not ended by another command. A run file from
   before (no `world` field) is read as before: the link is minted and opened. The main.ts road has no test seam; the
   run file's field and the decision are held here. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { readRunFile, runFilePath, writeRunFile } from "../src/runFile.ts";
import { worldRefusal } from "../src/runningHost.ts";

describe("npm run world beside a running host (H2, refuse)", () => {
  it("the run file says whether the host serves the built world; a file from before says nothing", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "crewhub-run-world-"));
    const before = process.env["TMPDIR"];
    process.env["TMPDIR"] = dir;
    try {
      const remove = writeRunFile(65002, { pid: process.pid, url: "http://127.0.0.1:65002", mintSecret: "s3cret", world: false });
      assert.deepEqual(readRunFile(65002), { pid: process.pid, url: "http://127.0.0.1:65002", mintSecret: "s3cret", world: false });
      remove();
      writeFileSync(runFilePath(65002), JSON.stringify({ pid: 1, url: "http://127.0.0.1:65002", mintSecret: "s3cret", world: true }));
      assert.equal(readRunFile(65002)?.world, true);
      writeFileSync(runFilePath(65002), JSON.stringify({ pid: 1, url: "http://127.0.0.1:65002", mintSecret: "s3cret" }));
      assert.equal(readRunFile(65002)?.world, undefined, "a file from before: unknown");
      writeFileSync(runFilePath(65002), JSON.stringify({ pid: 1, url: "http://127.0.0.1:65002", mintSecret: "s3cret", world: "yes" }));
      assert.equal(readRunFile(65002)?.world, undefined, "not a boolean: unknown, the file still read");
    } finally {
      if (before === undefined) delete process.env["TMPDIR"];
      else process.env["TMPDIR"] = before;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses only a host that says it serves no built world, with what to do; else nothing", () => {
    const dev = { pid: 1, url: "http://127.0.0.1:5389", mintSecret: "s", world: false };
    const refusal = worldRefusal(dev, 5389);
    assert.match(refusal ?? "", /^a development host \(npm run host\) runs on 5389 and serves no built world: stop it \(Ctrl\+C in its terminal\), or open your Vite page \(npm run dev\)$/);
    assert.equal(worldRefusal({ ...dev, world: true }, 5389), null, "a world host: the link is minted as before");
    assert.equal(worldRefusal({ pid: 1, url: "http://127.0.0.1:5389", mintSecret: "s" }, 5389), null, "a run file from before: as before");
    assert.equal(worldRefusal(null, 5389), null, "no run file: the host starts");
  });
});

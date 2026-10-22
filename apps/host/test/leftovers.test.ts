import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { SESSION_FILE_NAME, removeLeftoverSession } from "../src/leftovers.ts";

describe("a leftover loops-session file (the session road, removed in round 19)", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
  });
  const folder = () => {
    const dir = mkdtempSync(path.join(tmpdir(), "chw-leftover-"));
    dirs.push(dir);
    return dir;
  };

  it("is deleted on start with one log line that says why, and nothing else in the folder is touched", () => {
    const dir = folder();
    const file = path.join(dir, SESSION_FILE_NAME);
    writeFileSync(file, JSON.stringify({ v: 1, cookie: "sess_old" }), { mode: 0o600 });
    writeFileSync(path.join(dir, "loops-key"), "chl_not_a_real_key", { mode: 0o600 });
    const lines: string[] = [];
    assert.equal(removeLeftoverSession(dir, (line) => lines.push(line)), true);
    assert.equal(existsSync(file), false, "the session file is gone");
    assert.equal(existsSync(path.join(dir, "loops-key")), true, "the key file stays");
    assert.equal(lines.length, 1);
    assert.match(lines[0]!, /^removed the leftover chat session file .*loops-session: the sign-in road went with the switch to the viewer key \(round 19\)/);
    assert.ok(!lines[0]!.includes("sess_old"), "never the cookie");
  });

  it("says nothing and removes nothing when there is no such file, or no folder yet", () => {
    const lines: string[] = [];
    assert.equal(removeLeftoverSession(folder(), (line) => lines.push(line)), false);
    assert.equal(removeLeftoverSession(path.join(folder(), "not-made-yet"), (line) => lines.push(line)), false);
    assert.deepEqual(lines, []);
  });
});

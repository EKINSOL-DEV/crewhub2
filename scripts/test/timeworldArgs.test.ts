/* timeworld.mjs's crewhub-loops (tools/lib/timeworldArgs.ts, round 57d, mutation-harness.md §5b.2): --fake <port> or
   --loops-env <file>, one of them, never a search. The tool is never run here: the decision is the pure function's, and
   the tool's source is read to see that it asks the function before anything starts. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { timeworldTarget } from "../../tools/lib/timeworldArgs.ts";

const TOOLS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "tools");
const reason = (v: { ok: boolean; reason?: string }) => (v.ok ? "" : (v.reason as string));

test("--fake <port> or --loops-env <file>: the one given is the target", () => {
  assert.deepEqual(timeworldTarget({ fake: "5386", loopsEnv: "" }), { ok: true, fake: "5386", loopsEnv: "" });
  assert.deepEqual(timeworldTarget({ fake: "", loopsEnv: " ~/my-loops.env " }), { ok: true, fake: "", loopsEnv: "~/my-loops.env" });
});

test("neither is refused with one sentence before anything starts: no env file is searched for (round 57d)", () => {
  for (const args of [{ fake: "", loopsEnv: "" }, { fake: "  ", loopsEnv: " " }]) {
    assert.match(reason(timeworldTarget(args)), /^timeworld needs a crewhub-loops to time against: --fake <port> .* or --loops-env <file> .*; no env file is searched for$/);
  }
});

test("both are refused: they name two different crewhub-loops", () => {
  assert.match(reason(timeworldTarget({ fake: "5386", loopsEnv: "a.env" })), /^--fake and --loops-env name two different crewhub-loops: give one of them$/);
});

test("timeworld.mjs asks timeworldTarget right after its command line and searches for no env file (read, never run)", () => {
  const text = readFileSync(path.join(TOOLS, "timeworld.mjs"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const cli = text.indexOf("cli(USAGE");
  const target = text.indexOf("timeworldTarget({");
  assert.ok(cli > 0 && target > cli, "timeworldTarget is called after the command line is read");
  for (const later of ["await environment()", "launch(opts)", "rmSync(dist", "createLoopsFake("]) {
    const at = text.indexOf(later);
    assert.ok(at > target, `${later} comes after timeworldTarget`);
  }
  assert.doesNotMatch(text, /git-common-dir/, "no search of the main checkout");
  assert.doesNotMatch(text, /loops-dev\.env/, "no default env file name");
  assert.equal(text.split("opts.fake").length - 1, 1, "the fake comes from the target, the option is read once, by timeworldTarget");
});

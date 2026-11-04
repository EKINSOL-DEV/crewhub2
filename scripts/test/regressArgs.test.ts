/* regress.mjs's command line (tools/lib/regressArgs.ts, round 57d, mutation-harness.md §5b.1): the default groups are
   the nine that use fakes and stubs; real and the connect group's real half run only when real is named in --groups,
   with the env file --loops-env names and no other. The tool is never run here: the decisions are the pure function's,
   and the tool's source is read to see that it asks the function first and searches for no env file. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { DEFAULT_GROUPS, GROUPS, regressPlan } from "../../tools/lib/regressArgs.ts";

const TOOLS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "tools");
const reason = (v: { ok: boolean; reason?: string }) => (v.ok ? "" : (v.reason as string));
const none = { groups: "", real: false, loopsEnv: "" };

test("the default groups are the nine without real, and no env file is read for them (round 57d)", () => {
  assert.deepEqual(GROUPS, ["connect", "walk", "demo", "tour", "live", "town", "ops", "chat", "rooms", "real"]);
  assert.deepEqual(DEFAULT_GROUPS, ["connect", "walk", "demo", "tour", "live", "town", "ops", "chat", "rooms"]);
  assert.deepEqual(regressPlan(none), { ok: true, groups: [...DEFAULT_GROUPS], real: false, loopsEnv: "" });
  // A --loops-env given without real is not read: the run aims at no development loops.
  assert.deepEqual(regressPlan({ ...none, loopsEnv: "tools/out/loops-dev.env" }), { ok: true, groups: [...DEFAULT_GROUPS], real: false, loopsEnv: "" });
  assert.deepEqual(regressPlan({ ...none, groups: "connect, ops", loopsEnv: "x.env" }), { ok: true, groups: ["connect", "ops"], real: false, loopsEnv: "" });
});

test("real named in --groups is the opt-in: the real group and the connect group's real half, with --loops-env's file", () => {
  assert.deepEqual(regressPlan({ ...none, groups: "real", loopsEnv: " ~/my-loops.env " }), { ok: true, groups: ["real"], real: true, loopsEnv: "~/my-loops.env" });
  assert.deepEqual(regressPlan({ ...none, groups: "connect,real", loopsEnv: "a.env" }), { ok: true, groups: ["connect", "real"], real: true, loopsEnv: "a.env" });
});

test("real without --loops-env is refused with one sentence: no env file is searched for", () => {
  for (const groups of ["real", "connect,real", "walk, real"]) {
    const verdict = regressPlan({ ...none, groups });
    assert.equal(verdict.ok, false, groups);
    assert.match(reason(verdict), /^real reads the development loops from --loops-env <file> only .*: name the file, no file is searched for$/, groups);
  }
  assert.equal(regressPlan({ ...none, groups: "real", loopsEnv: "   " }).ok, false, "blank is not a file");
});

test("--real is refused with the way to ask for real; an unknown group is refused with the known ones", () => {
  for (const groups of ["", "real", "connect"]) {
    assert.match(reason(regressPlan({ groups, real: true, loopsEnv: "a.env" })), /^--real is not an option: name real in --groups \(--groups real, or --groups connect,real .*\)/, groups);
  }
  assert.match(reason(regressPlan({ ...none, groups: "walk,reall" })), /^unknown group "reall"; known: connect, walk, demo, tour, live, town, ops, chat, rooms, real$/);
});

/** The code of a tool without its comments, so a word in the manual does not count as a call. */
function code(file: string): string {
  return readFileSync(path.join(TOOLS, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

test("regress.mjs asks regressPlan right after its command line and searches for no env file (read, never run)", () => {
  const text = code("regress.mjs");
  const cli = text.indexOf("cli(USAGE");
  const plan = text.indexOf("regressPlan({");
  assert.ok(cli > 0 && plan > cli, "regressPlan is called after the command line is read");
  for (const later of ["launch(opts)", "checkBuild(", "createConnectStub(", "createLoopsFake", "createHost"]) {
    const at = text.indexOf(later);
    assert.ok(at === -1 || at > plan, `${later} comes after regressPlan`);
  }
  assert.doesNotMatch(text, /git-common-dir/, "no search of the main checkout");
  assert.doesNotMatch(text, /"Documents"/, "no search of ~/Documents/GitHub");
  assert.doesNotMatch(text, /loops-dev\$\{[^}]*\}\.env|loops-dev\.env/, "no default env file name");
  assert.match(text, /if \(plan\.real\) await realHalf\(\);/, "the connect group's real half only with real");
});

/* Regress's whole-run console check (tools/lib/closingCheck.ts, round 60, A7). The town group restarts its host three
   times on purpose; a town page whose stream drops reads `/world-api/health` at once (state/health.ts), and when that
   read lands while the port is closed the browser prints "Failed to load resource: net::ERR_CONNECTION_REFUSED". That
   line, and the RESET form, for that path, on the town group's pages, inside a restart's window, is admitted; nothing
   else is. fixtures/town-restart/run.json is a recorded town run (regress's <tag>-problems.json, 030bbb70) with the
   flake: three refused health reads, 23 and 24 ms after a restart began (9 and 15 ms after the next host listened). */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { closingCheck, RESTART_GRACE_MS, type HostRestart } from "../../tools/lib/closingCheck.ts";
import type { PageProblem } from "../../tools/lib/probeRefusal.ts";

const run = JSON.parse(readFileSync(new URL("./fixtures/town-restart/run.json", import.meta.url), "utf8")) as { restarts: HostRestart[]; problems: PageProblem[] };
const ORIGIN = run.restarts[0]!.origin;
/** The run's loops origins, as regress knows them: where its pages' road-2 probe went. */
const LOOPS_ORIGINS = [...new Set(run.problems.filter((p) => p.kind === "external").map((p) => new URL(p.url!).origin))];
const LOOPS = LOOPS_ORIGINS[0]!;
const REFUSED = "[town] Failed to load resource: net::ERR_CONNECTION_REFUSED";
const failing = (problems: readonly PageProblem[], restarts: readonly HostRestart[] = run.restarts) => closingCheck(problems, { loopsOrigins: LOOPS_ORIGINS, restarts }).failing.map((p) => p.text);
/** The recorded run's problems with one more line, a health refusal by default, `ms` after the first restart began. */
const plus = (ms: number, more: Partial<PageProblem> = {}): PageProblem[] => [...run.problems, { kind: "console", text: REFUSED, pageOrigin: ORIGIN, url: `${ORIGIN}/world-api/health`, at: run.restarts[0]!.from + ms, ...more }];

test("the recorded run: its refused health reads are the run's only failing lines without the restarts, and none with them", () => {
  const refused = run.problems.filter((p) => /ERR_CONNECTION_REFUSED/.test(p.text));
  assert.equal(refused.length, 3, "the record holds the flake");
  assert.deepEqual(failing(run.problems, []), refused.map((p) => p.text), "without the restart windows, the flake fails the run");
  assert.deepEqual(failing(run.problems), [], "inside the windows it is admitted");
  const verdict = closingCheck(run.problems, { loopsOrigins: LOOPS_ORIGINS, restarts: run.restarts });
  assert.equal(verdict.restartRefusals.length, 3);
  assert.equal(verdict.probeRefusals.length, run.problems.filter((p) => p.kind === "console" && !/ERR_CONNECTION/.test(p.text)).length, "the probe's lines are still the probe's");
});

test("a refusal outside every window still fails: before a restart, after its grace, or between two", () => {
  const first = run.restarts[0]!;
  const width = first.to - first.from;
  assert.deepEqual(failing(plus(-1)), [REFUSED], "a millisecond before the close");
  assert.deepEqual(failing(plus(width + RESTART_GRACE_MS + 1)), [REFUSED], "a millisecond after the grace");
  assert.deepEqual(failing(plus((run.restarts[1]!.from - first.from) / 2)), [REFUSED], "half-way to the next restart");
  assert.deepEqual(failing(plus(width + RESTART_GRACE_MS)), [], "the grace's last millisecond is inside");
  assert.deepEqual(failing(plus(0)), [], "the close's first millisecond is inside");
});

test("inside a window only that line, that path, those pages: anything else still fails", () => {
  const at = 5;
  assert.deepEqual(failing(plus(at, { text: REFUSED.replace("REFUSED", "RESET") })), [], "the RESET form is the same refusal");
  const cases: [string, Partial<PageProblem>][] = [
    ["another path on the host", { url: `${ORIGIN}/world-api/town` }],
    ["the health path at another origin", { url: "http://127.0.0.1:5394/world-api/health" }],
    ["a health path with more after it", { url: `${ORIGIN}/world-api/health/x` }],
    ["no URL blamed", { url: "" }],
    ["another page's origin", { pageOrigin: "http://127.0.0.1:5393" }],
    ["another group's tag", { text: REFUSED.replace("[town]", "[live]") }],
    ["no tag", { text: REFUSED.replace("[town] ", "") }],
    ["another failure", { text: REFUSED.replace("ERR_CONNECTION_REFUSED", "ERR_FAILED") }],
    ["a 503 answer", { text: "[town] Failed to load resource: the server responded with a status of 503 (Service Unavailable)" }],
    ["a page error", { kind: "pageerror" }],
  ];
  for (const [name, more] of cases) assert.equal(failing(plus(at, more)).length, 1, name);
  const { at: _heard, ...unheard } = plus(at).at(-1)!;
  assert.equal(failing([...run.problems, unheard]).length, 1, "no time heard");
});

test("no restarts, no admission; the external requests are left to their own check", () => {
  assert.deepEqual(failing(plus(5).slice(-1), []), [REFUSED], "the line alone, with no restart noted");
  assert.deepEqual(failing([{ kind: "external", text: `[town] ${LOOPS}/api/team`, pageOrigin: ORIGIN, url: `${LOOPS}/api/team`, at: 1 }]), []);
});

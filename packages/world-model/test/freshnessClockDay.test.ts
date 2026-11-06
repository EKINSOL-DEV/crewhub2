/* Design choice W1 (`clock`, round 72): the stamp is said as a clock time, with the date first only when the stamp is
   not from the viewer's today, and today is the model's `now` (the source's clock), not the machine's. Round 73's
   mutation run found three edges unpinned: the text view's Town line and the director's clause passed `model.now`
   (Date.now() in its place read the same while the stamps were old), and the zero padding of a one-digit hour, minute
   or second. The stamps here fall on one day in January 2026, with `now` ten seconds later on that day. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { describeWorld } from "../src/describe.ts";
import { noPlanLine } from "../src/director.ts";
import { freshnessWords } from "../src/freshness.ts";
import { agent, building, world } from "./fixtures.ts";

const TS = "2026-01-05T08:05:07Z";
const NOW = Date.parse(TS) + 10_000;
/** "HH:MM:SS" in the viewer's local time, worked out here on its own. */
const clock = (iso: string) => {
  const d = new Date(iso);
  const two = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
};

test("W1: a one-digit hour, minute or second is zero-padded", () => {
  assert.match(clock(TS), /:05:07$/, "the fixture's minute and second are one digit");
  const fresh = freshnessWords({ teamTs: TS, ageSeconds: 10, stale: false }, NOW);
  assert.equal(fresh.sentence, `Team snapshot from ${clock(TS)}, 10 s old.`);
  const stale = freshnessWords({ teamTs: TS, ageSeconds: 3600, stale: true }, NOW);
  assert.equal(stale.sentence, `The team snapshot is stale since ${clock(TS)}: every agent's status shows as unknown.`);
});

test("W1: the text view's Town line reads today by the model's clock, so a stamp of that day carries no date", () => {
  const model = world([building("cr", [agent("a1", { posture: "focused" })])], { freshness: { teamTs: TS, ageSeconds: 10, stale: false }, now: NOW });
  const town = describeWorld(model).find((l) => l.text.startsWith("Team snapshot from"));
  assert.equal(town?.text, `Team snapshot from ${clock(TS)}, 10 s old.`);
});

test("W1: the director's clause reads today by the model's clock too", () => {
  const model = world([building("cr", [agent("a1", { posture: "greyed" })])], { freshness: { teamTs: TS, ageSeconds: 3600, stale: true }, now: NOW });
  const line = noPlanLine(model, true);
  assert.match(line, new RegExp(`The team snapshot is stale since ${clock(TS)}, so a status shows as unknown until a fresh one\\.`));
  assert.doesNotMatch(line, /2026-01-05/, "no date: the stamp is from the model's today");
});

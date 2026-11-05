/* The trophy's label names the published release by its version when it has one (ruleProps.ts, round 65 w1-12), as the
   crate's names a draft; ruleLabels.test.ts only published releases without a version, so a label that always took the
   number survived (round 68, mx2: ruleProps.ts:101). */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ReleaseSummary } from "@crewhub/loops-client";
import { emptyMemory } from "../src/memory.ts";
import { Projection } from "../src/projection.ts";
import { reduceWorld } from "../src/reducer.ts";
import { ruleProps } from "../src/ruleProps.ts";
import { emptyTownDocument } from "../src/townDocument.ts";
import { FakeSource, ManualScheduler, T0, board, card, iso, lane, project, snapshot, team } from "./helpers.ts";

const CR = { slug: "crewhub", key: "CR" };
const release = (state: ReleaseSummary["state"], version: string | null): ReleaseSummary => ({ id: `rl_${state}_${version ?? "none"}`, number: 3, version, title: "Town skeleton", state, project: CR, ticketCount: 2, createdAt: iso(T0), appNote: { state: "n/a" } });

function labels(releases: ReleaseSummary[]) {
  const projection = new Projection(new FakeSource(), { scheduler: new ManualScheduler() });
  projection.apply({
    type: "snapshot",
    snapshot: snapshot({ projects: [project("crewhub", "CR", "cr-lead")], boards: { crewhub: board([card("t_1", "CR-1", "review")]) }, team: team(T0, [lane("cr-lead", "working")]), releases: { crewhub: releases } }),
  });
  const model = reduceWorld(projection.facts, emptyMemory(), { now: T0, mode: "demo", roleOverrides: {} }).model;
  return ruleProps(model, emptyTownDocument().rules).map((p) => `${p.key}: ${p.label}`);
}

test("w1-12 (round 68, mx2: ruleProps.ts:101): a published release with a version is named by it on the trophy, as the crate names a draft", () => {
  assert.deepEqual(labels([release("published", "0.3.0")]), ["trophy: Release 0.3.0: published"]);
  assert.deepEqual(labels([release("draft", "0.4.0")]), ["crate: Release 0.4.0: draft"]);
  assert.deepEqual(labels([release("published", null)]), ["trophy: Release 3: published"], "no version: the number");
});

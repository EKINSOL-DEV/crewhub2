/* Round 65 (w1-12): a rule prop's label over the prop says the fact, as the text view does, not the build-mode word
   "rule" and the prop's name ("RULE milestone banner"): "Milestone CR-M1 active", "Release 0.3.0: draft", "2 open bugs". */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { MilestoneSummary, ReleaseSummary } from "@crewhub/loops-client";
import { emptyMemory } from "../src/memory.ts";
import { Projection } from "../src/projection.ts";
import { reduceWorld } from "../src/reducer.ts";
import { ruleProps } from "../src/ruleProps.ts";
import { emptyTownDocument } from "../src/townDocument.ts";
import { FakeSource, ManualScheduler, T0, board, card, iso, lane, project, snapshot, team } from "./helpers.ts";

const CR = { slug: "crewhub", key: "CR" };
const milestone: MilestoneSummary = { id: "ms_1", key: "CR-M1", number: 1, title: "Town skeleton", state: "active", project: CR, position: 1, createdAt: iso(T0), updatedAt: iso(T0), revision: 1 };
const release = (state: ReleaseSummary["state"], version: string | null): ReleaseSummary => ({ id: `rl_${state}`, number: 3, version, title: "Town skeleton", state, project: CR, ticketCount: 2, createdAt: iso(T0), appNote: { state: "n/a" } });

function labels(options: { releases: ReleaseSummary[]; bugs: number }) {
  const projection = new Projection(new FakeSource(), { scheduler: new ManualScheduler() });
  const deploy = { id: "lb_d", name: "awaiting-deploy", color: "tangerine" as const };
  const bugs = Array.from({ length: options.bugs }, (_, i) => card(`t_b${i}`, `CR-${10 + i}`, "backlog", { kind: "bug" }));
  projection.apply({
    type: "snapshot",
    snapshot: snapshot({
      projects: [project("crewhub", "CR", "cr-lead")],
      boards: { crewhub: board([card("t_1", "CR-1", "review", { labels: [deploy] }), ...bugs]) },
      team: team(T0, [lane("cr-lead", "working")]),
      milestones: { crewhub: [milestone] },
      releases: { crewhub: options.releases },
    }),
  });
  const model = reduceWorld(projection.facts, emptyMemory(), { now: T0, mode: "demo", roleOverrides: {} }).model;
  return ruleProps(model, emptyTownDocument().rules).map((p) => `${p.key}: ${p.label}`);
}

test("round 65 (w1-12): each rule prop carries the fact in a few words, never the word rule", () => {
  assert.deepEqual(labels({ releases: [release("draft", "0.3.0")], bugs: 2 }), ["banner: Milestone CR-M1 active", "crate: Release 0.3.0: draft", "sticker.rocket: CR-1: awaiting-deploy", "jar: 2 open bugs"]);
  // One bug: singular. A published release: the trophy's label. A release without a version: its number.
  assert.deepEqual(labels({ releases: [release("published", null)], bugs: 1 }), ["banner: Milestone CR-M1 active", "sticker.rocket: CR-1: awaiting-deploy", "jar: 1 open bug", "trophy: Release 3: published"]);
  for (const label of labels({ releases: [release("draft", "0.3.0")], bugs: 2 })) assert.doesNotMatch(label, /\brule\b/i);
});

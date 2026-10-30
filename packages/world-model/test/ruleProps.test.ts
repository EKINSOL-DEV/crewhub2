import assert from "node:assert/strict";
import { test } from "node:test";
import type { Envelope, MilestoneSummary, ReleaseSummary } from "@crewhub/loops-client";
import { emptyMemory } from "../src/memory.ts";
import { Projection } from "../src/projection.ts";
import { reduceWorld } from "../src/reducer.ts";
import { ruleProps } from "../src/ruleProps.ts";
import { emptyTownDocument } from "../src/townDocument.ts";
import { FakeSource, ManualScheduler, T0, board, card, envelope, iso, lane, project, snapshot, team } from "./helpers.ts";

const CR = { slug: "crewhub", key: "CR" };
const milestone: MilestoneSummary = {
  id: "ms_1",
  key: "CR-M1",
  number: 1,
  title: "Town skeleton",
  state: "active",
  project: CR,
  position: 1,
  createdAt: iso(T0),
  updatedAt: iso(T0),
  revision: 1,
};
const release: ReleaseSummary = {
  id: "rl_3",
  number: 3,
  version: "0.3.0",
  title: "Town skeleton",
  state: "draft",
  project: CR,
  ticketCount: 2,
  createdAt: iso(T0),
  appNote: { state: "n/a" },
};

function world() {
  const projection = new Projection(new FakeSource(), { scheduler: new ManualScheduler() });
  const deploy = { id: "lb_d", name: "awaiting-deploy", color: "tangerine" as const };
  projection.apply({
    type: "snapshot",
    snapshot: snapshot({
      projects: [project("crewhub", "CR", "cr-lead")],
      boards: {
        crewhub: board([
          card("t_1", "CR-1", "review", { labels: [deploy] }),
          card("t_2", "CR-2", "backlog", { kind: "bug" }),
          card("t_3", "CR-3", "review", { kind: "bug" }),
          card("t_4", "CR-4", "done", { kind: "bug" }),
        ]),
      },
      team: team(T0, [lane("cr-lead", "working")]),
      milestones: { crewhub: [milestone] },
      releases: { crewhub: [release] },
    }),
  });
  const event = (type: string, payload: Record<string, unknown>, extra: Partial<Envelope> = {}) =>
    projection.apply({ type: "event", envelope: envelope(type, payload, { project: CR, actor: { id: "nicky", kind: "user" }, ...extra }) });
  const shown = (rules = emptyTownDocument().rules) =>
    ruleProps(reduceWorld(projection.facts, emptyMemory(), { now: T0, mode: "demo", roleOverrides: {} }).model, rules).map(
      (p) => `${p.id} ${p.key} ${p.anchor.kind === "room" ? p.anchor.room : p.anchor.kind === "desk" ? `desk:${p.anchor.agent}` : `ticket:${p.anchor.ticketKey}`}${p.count === null ? "" : ` ${p.count}`}`,
    );
  return { event, shown };
}

test("rule props follow the facts", () => {
  const { event, shown } = world();
  assert.deepEqual(shown(), [
    "rule:banner:crewhub:ms_1 banner lobby",
    "rule:crate:crewhub:rl_3 crate dispatch",
    "rule:sticker:crewhub:t_1 sticker.rocket ticket:CR-1",
    "rule:jar:crewhub jar desk:cr-lead 2",
  ]);

  // The release is published: the crate goes, a trophy appears on the lead's desk. The milestone completes.
  event("release.published", { releaseId: "rl_3", revision: 2, version: "0.3.0" });
  event("milestone.completed", { milestoneId: "ms_1", key: "CR-M1", title: "Town skeleton" });
  // One bug reaches Done, the other is archived; the deploy label is cleared by a move.
  const move = (id: string, key: string, from: string, to: string, extra: Record<string, unknown> = {}) =>
    event("ticket.moved", { from, to, position: 1, ...extra }, { ticket: { id, key, title: key } });
  move("t_3", "CR-3", "review", "done");
  event("ticket.archived", { batchId: null, batchSize: null, releaseId: null, reason: "manual" }, { ticket: { id: "t_2", key: "CR-2", title: "CR-2" } });
  move("t_1", "CR-1", "review", "done", { labelsCleared: ["awaiting-deploy"] });
  assert.deepEqual(shown(), ["rule:trophy:crewhub:rl_3 trophy desk:cr-lead"]);
});

test("switched-off rules show nothing", () => {
  const { shown } = world();
  const rules = { ...emptyTownDocument().rules, "milestone-banner": false, "bug-jar": false };
  assert.deepEqual(shown(rules), ["rule:crate:crewhub:rl_3 crate dispatch", "rule:sticker:crewhub:t_1 sticker.rocket ticket:CR-1"]);
});

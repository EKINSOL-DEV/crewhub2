/* The appearance module through its interface: one table, every surface of an agent per row, so the figure, the desk
   lamp, the name pill's dot and words, the status tag, the bubble, the lane chip and the sentences of the text view
   and the jump list are pinned together. Moved here (round 59d, C8): the desk lamp's lanes (was apps/world
   threeRoomDressing.test.ts `lampLane`) and "a stale snapshot overrides every lane status" (was townLayout.test.ts
   `laneWords`). */
import assert from "node:assert/strict";
import { test } from "node:test";
import { agentLook, agentWords, figureLook, laneLook, type DeskFacts, type FigureLook } from "../src/appearance.ts";
import type { AgentPlacement, Freshness } from "../src/model.ts";
import { agent } from "./fixtures.ts";

const TEAM_TS = "2026-10-01T09:00:00Z";
const FRESH: Freshness = { teamTs: TEAM_TS, ageSeconds: 30, stale: false };
const STALE: Freshness = { teamTs: TEAM_TS, ageSeconds: 900, stale: true };
const NONE: Freshness = { teamTs: null, ageSeconds: null, stale: true };
const NOW = 1_000_000;
/** "stale since HH:MM" in the viewer's local time, worked out here on its own. */
const since = (() => {
  const d = new Date(TEAM_TS);
  return `stale since ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
})();

const DONE_LANE = "done (herdr's pane status, not a finished ticket)";

interface Row {
  name: string;
  agent: Partial<AgentPlacement> | null;
  freshness?: Freshness;
  desk?: DeskFacts;
  workingIn?: string;
  /** pose, waiting, alert, proxy, lamp */
  figure: [FigureLook["pose"], boolean, boolean, boolean, FigureLook["lamp"]];
  /** tone, tag, words, bubble kind, chip (absent for a desk with nobody at it) */
  label?: [string, string | null, string, string | null, string];
  /** the text view's lane words, the jump list's sentence, asks for help */
  words?: [string, string, boolean];
}

const working = { posture: "focused", laneStatus: "working" } as const;
const unknown = { posture: "greyed", laneStatus: "unknown" } as const;
const ROWS: Row[] = [
  { name: "working", agent: working, figure: ["working", false, false, false, "working"], label: ["working", null, "working", null, "working"], words: ["working", "Working.", false] },
  { name: "idle", agent: {}, figure: ["idle", false, false, false, "idle"], label: ["idle", null, "idle", null, "planned"], words: ["idle", "Idle.", false] },
  { name: "herdr says done", agent: { laneStatus: "done" }, figure: ["done", false, false, false, "idle"], label: ["done", null, "done", null, "done"], words: [DONE_LANE, "Done.", false] },
  // The lane moved before the debounced posture did: the lamp and the dot take the lane, the figure the posture.
  { name: "working lane, posture not yet", agent: { laneStatus: "working" }, figure: ["idle", false, false, false, "working"], label: ["working", null, "working", null, "working"], words: ["working", "Working.", false] },
  { name: "blocked", agent: { posture: "raised-hand", laneStatus: "blocked" }, figure: ["blocked", false, false, false, "waiting"], label: ["blocked", "blocked", "blocked", "blocked", "blocked"], words: ["blocked on a prompt", "Asks for help.", true] },
  { name: "blocked lane, posture not yet", agent: { posture: "focused", laneStatus: "blocked" }, figure: ["working", false, false, false, "waiting"], label: ["blocked", null, "blocked", null, "blocked"], words: ["blocked on a prompt", "Asks for help.", true] },
  { name: "unknown, fresh snapshot", agent: unknown, figure: ["stale", false, false, false, "idle"], label: ["unknown", "status unknown", "status unknown", null, "stalled"], words: ["status unknown", "Status unknown.", false] },
  // A greyed posture over a lane that still says something: the figure, the dot and the tag go by the posture.
  { name: "greyed over a known lane", agent: { posture: "greyed", laneStatus: "idle" }, figure: ["stale", false, false, false, "idle"], label: ["unknown", "status unknown", "idle", null, "planned"], words: ["idle", "Idle.", false] },
  { name: "stale snapshot", agent: unknown, freshness: STALE, figure: ["stale", false, false, false, "idle"], label: ["unknown", since, since, null, "stalled"], words: ["status unknown", "Status unknown.", false] },
  { name: "no snapshot yet", agent: unknown, freshness: NONE, figure: ["stale", false, false, false, "idle"], label: ["unknown", "status unknown", "status unknown", null, "stalled"], words: ["status unknown", "Status unknown.", false] },
  // A stale snapshot overrides the lane's words even where the placement still says a lane (the old laneWords facts).
  { name: "stale over a working lane", agent: working, freshness: STALE, figure: ["working", false, false, false, "working"], label: ["unknown", since, since, null, "stalled"], words: ["working", "Working.", false] },
  { name: "lit, fresh", agent: { alerts: ["stalled CH-3", "waiting CH-4"] }, figure: ["idle", false, true, false, "idle"], label: ["idle", null, "idle", "alert", "planned"], words: ["idle", "Idle.", false] },
  { name: "lit, stale: the bubble is silent", agent: { ...unknown, alerts: ["stalled CH-3"] }, freshness: STALE, figure: ["stale", false, true, false, "idle"], label: ["unknown", since, since, null, "stalled"], words: ["status unknown", "Status unknown.", false] },
  { name: "a question, even stale", agent: { ...unknown, caption: { kind: "question", text: "which branch?", ticketKey: "CH-9", until: null } }, freshness: STALE, figure: ["stale", false, false, false, "idle"], label: ["unknown", since, since, "question", "stalled"], words: ["status unknown", "Asks for help.", true] },
  { name: "a fresh done", agent: { caption: { kind: "done", text: "merged", ticketKey: "CH-2", until: NOW + 4000 } }, figure: ["idle", false, false, false, "idle"], label: ["idle", null, "idle", "done", "planned"], words: ["idle", "Idle.", false] },
  { name: "a fading done", agent: { caption: { kind: "done", text: "merged", ticketKey: "CH-2", until: NOW + 3999 } }, figure: ["idle", false, false, false, "idle"], label: ["idle", null, "idle", null, "planned"], words: ["idle", "Idle.", false] },
  { name: "a done that stays", agent: { caption: { kind: "done", text: "merged", ticketKey: "CH-2", until: null } }, figure: ["idle", false, false, false, "idle"], label: ["idle", null, "idle", "done", "planned"], words: ["idle", "Idle.", false] },
  { name: "the hand outranks an alert", agent: { posture: "raised-hand", laneStatus: "blocked", alerts: ["stalled CH-3"] }, figure: ["blocked", false, true, false, "waiting"], label: ["blocked", "blocked", "blocked", "blocked", "blocked"], words: ["blocked on a prompt", "Asks for help.", true] },
  { name: "the desk ticket waits on a person", agent: {}, desk: { waiting: true }, figure: ["idle", true, false, false, "waiting"], label: ["idle", null, "idle", null, "planned"], words: ["idle", "Idle.", false] },
  { name: "working, its desk waits", agent: working, desk: { waiting: true }, figure: ["working", true, false, false, "waiting"], label: ["working", null, "working", null, "working"], words: ["working", "Working.", false] },
  { name: "a stalled ticket dims the lamp", agent: working, desk: { waiting: true, stalled: true }, figure: ["working", true, false, false, "dim"], label: ["working", null, "working", null, "working"], words: ["working", "Working.", false] },
  {
    name: "a proxy",
    agent: { ...working, presence: "proxy", workingIn: "bakery", locationInferred: true, alerts: ["stalled CH-3"] },
    desk: { waiting: true },
    workingIn: "Bakery",
    figure: ["idle", false, true, true, "idle"],
    label: ["proxy", "working in Bakery (inferred)", "working in Bakery (inferred)", null, "working"],
    words: ["working", "Working.", false],
  },
  { name: "a proxy, stale", agent: { ...unknown, presence: "proxy", workingIn: "bakery" }, freshness: STALE, workingIn: "Bakery", figure: ["idle", false, false, true, "idle"], label: ["proxy", "working in Bakery", "working in Bakery", null, "stalled"], words: ["status unknown", "Status unknown.", false] },
  { name: "nobody at the desk", agent: null, figure: ["idle", false, false, false, "off"] },
  { name: "nobody at a stalled desk", agent: null, desk: { stalled: true }, figure: ["idle", false, false, false, "dim"] },
];

test("every surface of an agent agrees, row by row (the appearance table)", () => {
  for (const row of ROWS) {
    const a = row.agent === null ? null : agent("ada", row.agent);
    const f = figureLook(a, row.desk);
    assert.deepEqual([f.pose, f.waiting, f.alert, f.proxy, f.lamp], row.figure, `${row.name}: the figure`);
    if (!a) continue;
    const view = { freshness: row.freshness ?? FRESH, now: NOW };
    const look = agentLook(a, view, row.workingIn);
    assert.deepEqual([look.tone, look.tag, look.words, look.bubble?.kind ?? null, look.chip], row.label, `${row.name}: the labels`);
    const words = agentWords(a);
    assert.deepEqual([words.lane, words.search, words.asksHelp], row.words, `${row.name}: the sentences`);
    // A lane status on its own reads as the agent's own pill does (a proxy's pill says where it works instead).
    const lane = laneLook(a.laneStatus, view.freshness);
    assert.equal(lane.chip, look.chip, `${row.name}: the chip`);
    if (a.presence === "real") assert.equal(lane.words, look.words, `${row.name}: the lane words`);
  }
});

test("the bubbles say who and what in their titles; the figure's look is filled in place when given one", () => {
  const ask = agentLook(agent("ada", { displayName: "Ada", caption: { kind: "question", text: "which branch?", ticketKey: "CH-9", until: null } }), { freshness: FRESH, now: NOW });
  assert.deepEqual(ask.bubble, { kind: "question", text: "a little help?", tone: "ask", title: "Ada asks on CH-9: which branch?" });
  const hand = agentLook(agent("ada", { displayName: "Ada", posture: "raised-hand", laneStatus: "blocked" }), { freshness: FRESH, now: NOW });
  assert.deepEqual(hand.bubble, { kind: "blocked", text: "blocked", tone: "ask", title: "Ada is blocked" });
  const lit = agentLook(agent("ada", { alerts: ["stalled CH-3", "waiting CH-4"] }), { freshness: FRESH, now: NOW });
  assert.deepEqual(lit.bubble, { kind: "alert", text: "stalled CH-3", tone: "alert", title: "stalled CH-3; waiting CH-4" });
  const done = agentLook(agent("ada", { displayName: "Ada", caption: { kind: "done", text: "merged", ticketKey: "CH-2", until: null } }), { freshness: FRESH, now: NOW });
  assert.deepEqual(done.bubble, { kind: "done", text: "done", tone: "done", title: "Ada on CH-2: merged" });
  // A proxy never carries a bubble; a progress caption ("start", "update") is no bubble.
  assert.equal(agentLook(agent("ada", { presence: "proxy", caption: { kind: "question", text: "?", ticketKey: "CH-9", until: null } }), { freshness: FRESH, now: NOW }).bubble, null);
  assert.equal(agentLook(agent("ada", { caption: { kind: "update", text: "half way", ticketKey: "CH-9", until: null } }), { freshness: FRESH, now: NOW }).bubble, null);
  // The text view's sentence: the lane words and the posture.
  assert.equal(agentWords(agent("ada", { posture: "raised-hand", laneStatus: "blocked" })).state, "blocked on a prompt, posture hand raised");
  assert.equal(agentWords(agent("ada", unknown)).state, "status unknown, posture greyed out");
  const into: FigureLook = { pose: "idle", waiting: false, alert: false, proxy: false, lamp: "off" };
  assert.equal(figureLook(agent("ada", working), {}, into), into);
  assert.deepEqual(into, { pose: "working", waiting: false, alert: false, proxy: false, lamp: "working" });
});

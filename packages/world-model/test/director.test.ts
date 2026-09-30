import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_INTENTS_PER_PLAN, describeIntent, planInput, validateIntents } from "../src/director.ts";
import type { Intent, Reachable } from "../src/director.ts";
import { agent, building, object, room, world } from "./fixtures.ts";

const always: Reachable = () => true;
const go = (who: string, extra: Record<string, unknown> = {}) => ({
  kind: "goToProp",
  agent: who,
  room: "lobby",
  tag: "coffee-machine",
  ttlMs: 60_000,
  ...extra,
});

function town() {
  return world([
    building("cr", [
      agent("idle-1"),
      agent("idle-2"),
      agent("busy", { posture: "focused", laneStatus: "working" }),
      agent("stuck", { posture: "raised-hand", laneStatus: "blocked" }),
      agent("quiet", { deskTicketKey: "CR-9" }),
      agent("asked", { deskTicketKey: "CR-10" }),
      agent("proxy-1", { presence: "proxy", workingIn: "other" }),
    ], {
      objects: [
        object("CR-9", { deskOf: "quiet", stall: { state: "stalled", quietSince: "x", quietMinutes: 20 } }),
        object("CR-10", { deskOf: "asked", waitingOnHuman: true }),
      ],
    }),
    building("other", [agent("elsewhere", { building: "other" })]),
  ], { townHall: [agent("hall", { building: null, room: null })] });
}

function reasonOf(intent: unknown, reachable: Reachable = always): string {
  const { accepted, rejected } = validateIntents(town(), [intent], reachable);
  assert.equal(accepted.length, 0, "expected a rejection");
  return rejected[0]!.reason;
}

test("an idle agent's intents of every kind are accepted", () => {
  const intents: Intent[] = [
    go("idle-1") as Intent,
    { kind: "visitAgent", agent: "idle-2", target: "busy", ttlMs: 30_000 },
    { kind: "stay", agent: "elsewhere", ttlMs: 30_000 },
  ];
  const { accepted, rejected } = validateIntents(town(), intents, always);
  assert.equal(accepted.length, 3);
  assert.deepEqual(rejected, []);
});

test("it never moves a working, blocked, stalled or waiting agent", () => {
  assert.match(reasonOf(go("busy")), /working/);
  assert.match(reasonOf(go("stuck")), /blocked/);
  assert.match(reasonOf(go("quiet")), /stalled/);
  assert.match(reasonOf(go("asked")), /waiting on a person/);
  assert.match(reasonOf({ kind: "stay", agent: "busy", ttlMs: 30_000 }), /working/);
});

test("proxies, agents outside a building and unknown agents cannot be moved", () => {
  assert.match(reasonOf(go("proxy-1")), /proxy/);
  assert.match(reasonOf(go("hall")), /town hall/);
  assert.match(reasonOf(go("nobody")), /not a known agent/);
});

test("the room must exist and the prop tag must be reachable", () => {
  assert.match(reasonOf(go("idle-1", { room: "design" })), /no design/);
  const none: Reachable = (q) => q.kind !== "prop";
  assert.match(reasonOf(go("idle-1"), none), /no reachable prop tagged "coffee-machine"/);
  assert.match(reasonOf(go("idle-1", { tag: "Coffee Machine" })), /kebab-case/);
});

test("visiting needs a real avatar in the same building", () => {
  assert.match(reasonOf({ kind: "visitAgent", agent: "idle-1", target: "elsewhere", ttlMs: 30_000 }), /not a real avatar/);
  assert.match(reasonOf({ kind: "visitAgent", agent: "idle-1", target: "proxy-1", ttlMs: 30_000 }), /not a real avatar/);
  assert.match(reasonOf({ kind: "visitAgent", agent: "idle-1", target: "idle-1", ttlMs: 30_000 }), /itself/);
});

test("gather needs a meeting room, two idle agents and a shared building", () => {
  const g = { kind: "gather", agents: ["idle-1", "idle-2"], room: "meeting", ttlMs: 60_000 };
  assert.match(reasonOf(g), /no meeting room/);
  const withMeeting = world([
    building("cr", [agent("idle-1"), agent("idle-2"), agent("busy", { posture: "focused" })], {
      rooms: [room("lobby"), room("meeting")],
    }),
  ]);
  assert.equal(validateIntents(withMeeting, [g], always).accepted.length, 1);
  const withBusy = validateIntents(withMeeting, [{ ...g, agents: ["idle-1", "busy"] }], always);
  assert.match(withBusy.rejected[0]!.reason, /busy is working/);
});

test("intents carry no text: extra fields and unknown kinds are rejected", () => {
  assert.match(reasonOf(go("idle-1", { say: "hello team" })), /no text/);
  assert.match(reasonOf({ kind: "stay", agent: "idle-1", ttlMs: 30_000, text: "hi" }), /no text/);
  assert.match(reasonOf({ kind: "speak", agent: "idle-1", ttlMs: 30_000 }), /closed list/);
  assert.match(reasonOf(go("idle-1", { ttlMs: 0 })), /ttlMs/);
  assert.match(reasonOf("go to the lobby"), /not an intent object/);
});

test("at most 8 intents per building per plan, counted per building", () => {
  const many = world([
    building("cr", Array.from({ length: 12 }, (_, i) => agent(`a${i}`))),
    building("other", [agent("b0", { building: "other" })]),
  ]);
  const intents = [...Array.from({ length: 12 }, (_, i) => go(`a${i}`)), go("b0")];
  const { accepted, rejected } = validateIntents(many, intents, always);
  assert.equal(accepted.filter((i) => "agent" in i && i.agent.startsWith("a")).length, MAX_INTENTS_PER_PLAN);
  assert.equal(rejected.length, 4);
  assert.match(rejected[0]!.reason, /more than 8 intents/);
  assert.ok(accepted.some((i) => "agent" in i && i.agent === "b0"), "another building has its own cap");
});

test("one intent per agent per plan", () => {
  const { accepted, rejected } = validateIntents(town(), [go("idle-1"), { kind: "stay", agent: "idle-1", ttlMs: 30_000 }], always);
  assert.equal(accepted.length, 1);
  assert.match(rejected[0]!.reason, /already has an intent/);
});

test("the plan input holds labels, tags, role, state and place, and is cut to its budget", () => {
  const model = town();
  const tags = (r: string) => (r === "lobby" ? ["coffee-machine"] : []);
  const full = planInput(model, "cr", tags)!;
  assert.deepEqual(
    full.input.agents.find((a) => a.id === "quiet"),
    { id: "quiet", role: "worker", state: "stalled", place: "workers" },
  );
  assert.ok(!full.json.includes("CR-9") && !full.json.includes("title"), "no ticket text in the input");
  assert.equal(full.input.agents.length, 6, "proxies are not part of the plan");
  const cut = planInput(model, "cr", tags, full.tokens - 30)!;
  assert.ok(cut.truncated && cut.tokens <= full.tokens - 30 && cut.input.agents.length < 6);
  assert.equal(planInput(model, "missing", tags), null);
});

test("an intent reads as one sentence with no speech", () => {
  assert.equal(describeIntent(town(), go("idle-1") as Intent), "idle-1 goes to the coffee machine in the lobby");
});

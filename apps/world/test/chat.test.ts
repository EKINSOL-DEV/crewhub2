/* The page's chat (state/chat.ts) through its interface, both adapters: `open`, `answerTarget`, `panel`, `api`, `start`
   and `follow`. The demo's over `createDemoSource` (a manual scheduler) under a world runtime, or a dock the test drives
   by hand; the live one's over the same world with a road that records its starts and stops.
   Round 59d, C9: the facts once pinned on chatInvalidations.ts (folded in) are here, on the demo adapter's `start`; the
   demo DM read-back moved here from test/worldRuntime.test.ts with the read-back itself (agentName's facts with it: by
   name in a building, the town hall or the post office, and no name for an agent the model does not place). */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createDemoSource, createManualScheduler, type DemoSource } from "@crewhub/demo";
import type { ChatLine, HostHealth, HostSessionState, SourceMessage, WorldSource } from "@crewhub/loops-client";
import type { QueryKey } from "@tanstack/react-query";
import { demoChat, liveChat, opensSettings, PINS_KEY, PINS_QUERY_KEY, type ChatWorld, type RoadWord } from "../src/state/chat.ts";
import { answerTarget } from "../src/state/recentAnswers.ts";
import { createWorldRuntime, worldSources, type FrameClock } from "../src/state/world.ts";
import { world as fixtureWorld } from "./fixtures.ts";

const settle = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits (real time, for the demo's answered promises and the world's reduction) until `check` holds, at most `limit` ms. */
async function until(check: () => boolean, limit = 5_000): Promise<void> {
  const end = Date.now() + limit;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out");
    await settle(10);
  }
}

const clock: FrameClock = { now: () => performance.now(), frame: (fn) => fn(), after: (ms, fn) => void setTimeout(fn, ms), every: () => {}, hidden: () => false };
const outlets = { said: () => {}, threads: () => {}, hostConnected: () => {}, firstSnapshot: () => {} };

/** The demo under a world runtime, its town standing (G-Man in the town hall, the leads in their buildings). */
async function demoWorld(options: { buildingLimit?: number; source?: (demo: DemoSource) => WorldSource } = {}) {
  const scheduler = createManualScheduler(0);
  const demo = createDemoSource({ scheduler, epochMs: 0 });
  const world = createWorldRuntime({ source: options.source ? options.source(demo) : demo, chat: demo, epochMs: 0, clock, buildingLimit: options.buildingLimit ?? NaN, outlets });
  scheduler.advance(400_000);
  await settle(50);
  world.setRoleOverrides({});
  await until(() => world.state.model.townHall.some((a) => a.name === "g-man"));
  return { world, demo, scheduler };
}

/** A Storage in memory; `broken` makes every call throw, as a blocked site's does. */
function storage(broken = false) {
  const data = new Map<string, string>();
  return {
    data,
    getItem(key: string) {
      if (broken) throw new Error("blocked");
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (broken) throw new Error("blocked");
      data.set(key, value);
    },
  };
}

/** The demo's chat with what it said and what it refreshed recorded. */
function demoOf(world: ChatWorld, dock: DemoSource, store: ReturnType<typeof storage> | null = storage()) {
  const said: ChatLine[] = [];
  const refreshed: QueryKey[] = [];
  const chat = demoChat({ world, dock, said: (line) => void said.push(line), storage: () => store });
  return { chat, said, refreshed, sink: (key: QueryKey) => void refreshed.push(key) };
}

/** A dock the test drives by hand: `emit` hands its listener any message. */
function handDock() {
  let listener: ((m: SourceMessage) => void) | null = null;
  const dock = {
    start(l: (m: SourceMessage) => void) {
      listener = l;
      l({ type: "snapshot", snapshot: {} } as SourceMessage);
      return () => void (listener = null);
    },
    getDmMessages: async () => [],
  } as unknown as DemoSource;
  const event = (type: string, payload: Record<string, unknown> = {}) => listener?.({ type: "event", envelope: { seq: 1, type, actor: { id: "x", kind: "agent" }, payload } } as unknown as SourceMessage);
  return { dock, event, listening: () => listener !== null };
}

const handWorld = { state: { model: fixtureWorld([]), text: [], playback: null }, source: {} as WorldSource, projection: {} } as unknown as ChatWorld;

test("the demo's start: the dock's snapshot refreshes the threads, the messages, the summary and the agents; a dm event or a delivery naming a dm thread the messages and the threads; nothing else does; the stop ends it", () => {
  const { dock, event, listening } = handDock();
  const { chat, refreshed, sink } = demoOf(handWorld, dock);
  const stop = chat.start(sink);
  assert.deepEqual(refreshed.splice(0), [["dm-threads"], ["dm-messages"], ["dm-summary"], ["agents"]], "the snapshot the dock hands at once");
  const both = [["dm-messages"], ["dm-threads"]];
  event("dm.created");
  assert.deepEqual(refreshed.splice(0), both);
  event("dm.read");
  assert.deepEqual(refreshed.splice(0), both);
  event("delivery.created", { dmThreadId: "t1" });
  assert.deepEqual(refreshed.splice(0), both);
  event("delivery.created", { dmThreadId: 7 });
  assert.deepEqual(refreshed.splice(0), [], "a thread id that is no string");
  event("ticket.moved");
  event("admin.dm");
  event("dmz.made");
  assert.deepEqual(refreshed.splice(0), [], "only a type that starts with dm. (with its dot)");
  stop();
  assert.equal(listening(), false, "the stop lets go of the dock");
});

test("the demo opens an agent's card, never a panel; an answer row opens the card under the model's name; the dock's api is one", async () => {
  const { world, demo } = await demoWorld();
  const { chat } = demoOf(world, demo);
  assert.deepEqual(chat.open("cr-lead"), { card: "cr-lead" });
  assert.deepEqual(chat.open(null), { card: null }, "the chip: the dock is the chat, nothing to open");
  assert.equal(chat.panel, false, "a card shows no Chat button");
  assert.ok(chat.api !== null);
  assert.equal(chat.api, chat.api, "made once");
  const gman = world.state.model.townHall.find((a) => a.name === "g-man")!;
  assert.deepEqual(chat.answerTarget({ agentId: "g-man", agentName: null }), { agent: { key: gman.key, name: "G-Man" }, action: "Open G-Man's card", note: null });
  assert.deepEqual(chat.answerTarget({ agentId: "gone", agentName: "Gone" }), { agent: { key: "gone", name: "Gone" }, action: "Open Gone's card", note: null }, "an agent the model no longer places");
  assert.deepEqual(chat.answerTarget({ agentId: "gone", agentName: null }), { agent: { key: "gone", name: "gone" }, action: "Open gone's card", note: null });
});

test("the demo follows the lead of the building you are in: the dock's default head, its pins read again; the same lead again does nothing; the person's pins win", async () => {
  const { world, demo } = await demoWorld();
  const { chat, refreshed, sink } = demoOf(world, demo);
  const pins = async () => ((await chat.api!.handle("GET", "/api/me/bubbles")).body as { pinnedAgentIds: string[] }).pinnedAgentIds;
  assert.deepEqual(await pins(), ["g-man"], "the crewhub lead before any view");
  chat.follow({ health: null, leadId: "marky" });
  assert.deepEqual(await pins(), ["marky"], "followed before start: the view is set, nothing to refresh yet");
  const stop = chat.start(sink);
  refreshed.splice(0);
  chat.follow({ health: null, leadId: "cr-lead" });
  assert.deepEqual(await pins(), ["cr-lead"]);
  assert.deepEqual(refreshed.splice(0), [PINS_QUERY_KEY]);
  chat.follow({ health: null, leadId: "cr-lead" });
  assert.deepEqual(refreshed.splice(0), [], "the same lead: nothing");
  chat.follow({ health: null, leadId: null });
  assert.deepEqual(await pins(), ["g-man"], "out of every building: the crewhub lead again");
  assert.equal((await chat.api!.handle("PUT", "/api/me/bubbles", { pinnedAgentIds: ["marky"] })).status, 200);
  chat.follow({ health: null, leadId: "cr-lead" });
  assert.deepEqual(await pins(), ["marky"], "pinned: the view no longer decides");
  stop();
  refreshed.splice(0);
  chat.follow({ health: null, leadId: "g-man" });
  assert.deepEqual(refreshed, [], "stopped: nothing is refreshed");
});

test("the demo's pins: kept under their key and read by the next page's chat; nothing stored, unreadable, a storage that throws or none: the default, and the pins last for this page", async () => {
  const { world, demo } = await demoWorld();
  const kept = storage();
  const first = demoOf(world, demo, kept).chat;
  assert.equal((await first.api!.handle("PUT", "/api/me/bubbles", { pinnedAgentIds: ["cr-lead"] })).status, 200);
  assert.deepEqual(JSON.parse(kept.data.get(PINS_KEY)!), ["cr-lead"]);
  const pinsOf = async (chat: ReturnType<typeof demoOf>["chat"]) => ((await chat.api!.handle("GET", "/api/me/bubbles")).body as { pinnedAgentIds: string[] }).pinnedAgentIds;
  assert.deepEqual(await pinsOf(demoOf(world, demo, kept).chat), ["cr-lead"], "a reload keeps them");
  kept.data.set(PINS_KEY, "{not json");
  assert.deepEqual(await pinsOf(demoOf(world, demo, kept).chat), ["g-man"], "unreadable: never pinned");
  kept.data.set(PINS_KEY, JSON.stringify([1, 2]));
  assert.deepEqual(await pinsOf(demoOf(world, demo, kept).chat), ["g-man"], "not a list of ids: never pinned");
  for (const store of [storage(true), null]) {
    const chat = demoOf(world, demo, store).chat;
    assert.deepEqual(await pinsOf(chat), ["g-man"]);
    assert.equal((await chat.api!.handle("PUT", "/api/me/bubbles", { pinnedAgentIds: ["marky"] })).status, 200, "a storage that throws or none never fails the pin");
    assert.deepEqual(await pinsOf(chat), ["marky"], "kept for this page");
  }
});

/** The person asks each agent; the dock's scripted replies come (the demo answers a DM after a while). */
async function askAll(demo: DemoSource, scheduler: ReturnType<typeof createManualScheduler>, said: ChatLine[], agents: string[]) {
  const asked = agents.map((agent, i) => demo.sendDm(agent, "How is it going?", `c${i}`));
  const answered = (agentId: string) => said.some((l) => l.agentId === agentId);
  for (let i = 0; i < 60 && !agents.every(answered); i += 1) {
    scheduler.advance(1_000);
    await settle(5);
  }
  await until(() => agents.every(answered));
  return asked;
}

test("the demo's dock answers: an agent's reply is read back into the said store with its display name, in a building, the town hall or the post office; the person's own messages never", async () => {
  const { world, demo, scheduler } = await demoWorld();
  assert.ok(world.state.model.buildings.some((b) => b.agents.some((a) => a.name === "cr-lead")), "CR Lead in a building");
  assert.ok(world.state.model.postOffice.some((a) => a.name === "postman"), "the postman at the post office");
  const { chat, said, sink } = demoOf(world, demo);
  const stop = chat.start(sink);
  const asked = await askAll(demo, scheduler, said, ["g-man", "cr-lead", "postman"]);
  const byAgent = new Map(said.map((l) => [l.agentId, l]));
  assert.equal(byAgent.get("g-man")?.agentName, "G-Man");
  assert.equal(byAgent.get("cr-lead")?.agentName, "CR Lead");
  assert.equal(byAgent.get("postman")?.agentName, "Postman");
  for (const line of said) assert.ok(line.text !== "" && !line.text.includes("\n"), "one line");
  assert.ok(!said.some((l) => asked.some((m) => m.id === l.messageId)), "the person's own messages are never read back");
  stop();
  const before = said.length;
  demo.sendDm("g-man", "Still there?", "c9");
  for (let i = 0; i < 60; i += 1) scheduler.advance(1_000);
  await settle(100);
  assert.equal(said.length, before, "stopped: nothing more is read back");
});

test("a reply from an agent the model does not place is read back without a name (here the building limit hides CR Lead's building)", async () => {
  const { world, demo, scheduler } = await demoWorld({ buildingLimit: 0 });
  assert.equal(world.state.model.buildings.length, 0);
  assert.ok(!world.state.model.townHall.some((a) => a.name === "cr-lead"), "CR Lead is placed nowhere in this model");
  const { chat, said, sink } = demoOf(world, demo);
  chat.start(sink);
  await askAll(demo, scheduler, said, ["cr-lead"]);
  const line = said.find((l) => l.agentId === "cr-lead")!;
  assert.equal("agentName" in line, false, "no agentName at all, not a null one");
  assert.ok(line.text !== "");
});

test("a dock that is not the world's own source (one in front of it, the stress fixture's separate dock) reads nothing back, though it refreshes the dock", async () => {
  const front = await demoWorld({ source: (d) => Object.create(d) as WorldSource });
  const { chat, said, refreshed, sink } = demoOf(front.world, front.demo);
  chat.start(sink);
  front.demo.sendDm("g-man", "Hello?", "c1");
  for (let i = 0; i < 60; i += 1) front.scheduler.advance(1_000);
  await settle(100);
  assert.deepEqual(said, []);
  assert.ok(refreshed.some((k) => k[0] === "dm-messages"), "the dock's queries are refreshed all the same");
  // The stress fixture keeps a separate demo for the dock: the world's source is not the dock.
  const scheduler = createManualScheduler(0);
  const stress = worldSources({ live: false, scenarioId: "small-team", stressSize: 12 }, { scheduler, epochMs: 0 });
  assert.ok(stress.chat !== null && stress.source !== stress.chat);
  const world = createWorldRuntime({ ...stress, epochMs: 0, clock, buildingLimit: NaN, outlets });
  const s = demoOf(world, stress.chat);
  s.chat.start(s.sink);
  scheduler.advance(400_000);
  await settle(50);
  stress.chat.sendDm("g-man", "Hello?", "c1");
  for (let i = 0; i < 60; i += 1) scheduler.advance(1_000);
  await settle(100);
  assert.deepEqual(s.said, []);
});

/** A host's health as the live chat reads it: the loops web url it names and its key's word on the chat. */
const health = (session: HostSessionState | undefined, loopsWebUrl?: string): HostHealth =>
  ({ loops: "ok", keyName: "k", sharedKey: false, ...(loopsWebUrl ? { loopsWebUrl } : {}), connection: { discovery: { state: "found" }, key: { state: "ok" }, stream: { state: "ok", reconnects: 0 }, ...(session ? { session } : {}) } }) as HostHealth;

/** The live chat over a world, its road recording each start (the word) and stop. */
function liveOf(world: ChatWorld) {
  const log: (RoadWord | "stop")[] = [];
  const chat = liveChat({
    world,
    road: (word) => {
      log.push(word);
      return () => void log.push("stop");
    },
  });
  return { chat, log };
}

test("the live chat opens the Chat panel (for the agent, under the model's name; from the chip for none); an answer row goes by the card's rule; no dock api", async () => {
  const { world } = await demoWorld();
  const { chat } = liveOf(world);
  const lead = world.state.model.buildings.flatMap((b) => b.agents).find((a) => a.name === "cr-lead")!;
  assert.deepEqual(chat.open(lead.key), { panel: { key: lead.key, name: "CR Lead" } });
  assert.deepEqual(chat.open("nobody"), { panel: { key: "nobody", name: "nobody" } }, "an agent the model does not place: its key");
  assert.deepEqual(chat.open(null), { panel: null });
  assert.equal(chat.panel, true, "a card shows a Chat button");
  assert.equal(chat.api, null, "no dock: api/client has nothing to ask");
  assert.deepEqual(chat.answerTarget({ agentId: "gone", agentName: "Gone" }), answerTarget({ agentId: "gone", agentName: "Gone" }, null), "no card facts: the panel for the agent by its id");
  const target = chat.answerTarget({ agentId: "cr-lead", agentName: null });
  assert.equal(target.agent?.key, lead.key, "a placed agent: by its card's facts (a lead has its own chat)");
  assert.equal(target.action, "Chat with CR Lead");
  assert.equal(target.note, null);
});

test("the live chat's road 2: started with the host's word once both the page runs it and an origin is named; restarted only when the origin or the key's word changes; stopped with the chat", () => {
  const { chat, log } = liveOf(handWorld);
  chat.follow({ health: health(undefined, "http://127.0.0.1:47000/"), leadId: null });
  assert.deepEqual(log, [], "not started yet: the word is kept");
  const stop = chat.start(() => assert.fail("the live chat refreshes no dock"));
  assert.deepEqual(log.splice(0), [{ loopsOrigin: "http://127.0.0.1:47000", hostKeyReadsChat: false }]);
  chat.follow({ health: health(undefined, "http://127.0.0.1:47000/other"), leadId: "cr-lead" });
  assert.deepEqual(log, [], "the same origin and word (a new health read, another building): nothing");
  chat.follow({ health: health({ state: "key" }, "http://127.0.0.1:47000/"), leadId: null });
  assert.deepEqual(log.splice(0), ["stop", { loopsOrigin: "http://127.0.0.1:47000", hostKeyReadsChat: true }], "the key's word changed");
  chat.follow({ health: health({ state: "key" }, "http://127.0.0.1:47001/"), leadId: null });
  assert.deepEqual(log.splice(0), ["stop", { loopsOrigin: "http://127.0.0.1:47001", hostKeyReadsChat: true }], "the origin changed");
  chat.follow({ health: health({ state: "unknown" }), leadId: null });
  assert.deepEqual(log.splice(0), ["stop"], "no origin named: no road");
  chat.follow({ health: null, leadId: null });
  assert.deepEqual(log, [], "no health yet: still no origin, nothing new");
  chat.follow({ health: health({ state: "unknown" }, "http://127.0.0.1:47000/"), leadId: null });
  assert.deepEqual(log.splice(0), [{ loopsOrigin: "http://127.0.0.1:47000", hostKeyReadsChat: null }], "the host has not said: the runner itself waits");
  stop();
  assert.deepEqual(log.splice(0), ["stop"]);
  chat.follow({ health: health({ state: "key" }, "http://127.0.0.1:47000/"), leadId: null });
  assert.deepEqual(log, [], "stopped: a new word is kept, nothing runs");
  chat.start(() => {});
  assert.deepEqual(log.splice(0), [{ loopsOrigin: "http://127.0.0.1:47000", hostKeyReadsChat: true }], "started again with the last word (StrictMode's second mount)");
});

test("opensSettings: only a route under /settings opens the Settings card", () => {
  assert.equal(opensSettings("/settings"), true);
  assert.equal(opensSettings("/settings/agents/connect"), true);
  assert.equal(opensSettings("/agents"), false);
  assert.equal(opensSettings("/x/settings"), false);
  assert.equal(opensSettings(""), false);
});

test("the pins' query key is the copied chat's own (components/bubbles/queries.ts dmKeys.pins, a verbatim copy this module cannot load)", () => {
  const queries = readFileSync(new URL("../src/components/bubbles/queries.ts", import.meta.url), "utf8");
  assert.match(queries, new RegExp(`pins: ${JSON.stringify(PINS_QUERY_KEY).replace(/[[\]]/g, "\\$&")} as const`));
});

/* Round 44: the demo over many loops. Every other demo test plays at most one loop (helpers.ts `playLoop`); the source
   carries the person's chat into every later loop (`carryChat` in source.ts, the entries with ids from CHAT_FIRST_ID),
   so a long demo session is loops of the script plus the same carried chat. Ten loops here through the projection and
   the reducer, with three messages sent to an agent in the first loop: from loop 2 to loop 10 the envelopes per loop,
   the chat per loop, the facts and the reducer's memory stay flat. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_PRESENCE, Projection, emptyMemory, reduceWorld, type PresentationMemory } from "@crewhub/world-model";
import { createDirectorFeed } from "../src/director.ts";
import { DEMO_SEED, SCRIPT_DURATION_MS } from "../src/script.ts";
import { createDemoSource } from "../src/source.ts";
import { createManualScheduler } from "../src/scheduler.ts";

const LOOPS = 10;
const SPEED = 16;
const WALL_STEP = 2_000;

interface LoopStats {
  envelopes: number;
  chat: number;
  cards: number;
  deliveries: number;
  lists: number;
  lastMoves: number;
  places: number;
  movesSeen: number;
  flights: number;
  lanes: number;
  dmMessages: number;
  dmThreads: number;
  /** The director feed's plan stamps held (round 45: the last day's at most). */
  stamps: number;
  /** The most the lists, the deliveries and lastMoves held during the loop (the snapshot at its end resets them). */
  peakLists: number;
  peakDeliveries: number;
  peakLastMoves: number;
}

test(`${LOOPS} loops through the projection and the reducer: from loop 2 on, the envelopes, the carried chat, the facts and the memory stay flat`, async () => {
  const scheduler = createManualScheduler();
  const source = createDemoSource({ scheduler, speed: SPEED, seed: 44 });
  const projection = new Projection(source, { coalesceMs: 0 });
  let memory: PresentationMemory = emptyMemory();
  // The scripted director, stepped on every model as the app's state/director does (round 45).
  const feed = createDirectorFeed({ seed: DEMO_SEED, reachable: () => true, propTags: () => ["coffee", "whiteboard"], settings: { ...DEFAULT_PRESENCE, directorEnabled: true } });
  const loops: LoopStats[] = [];
  let envelopes = 0, chat = 0, snapshots = 0;
  const peak = { lists: 0, deliveries: 0, lastMoves: 0 };
  const samplePeak = () => {
    const f = projection.facts;
    peak.lists = Math.max(peak.lists, f.comments.length + f.progress.length + f.archives.length + f.unarchives.length + f.automationRuns.length + f.automationChanges.length);
    peak.deliveries = Math.max(peak.deliveries, Object.keys(f.deliveries).length);
    peak.lastMoves = Math.max(peak.lastMoves, Object.keys(f.lastMoves).length);
  };
  const closeLoop = async () => {
    const f = projection.facts;
    loops.push({
      stamps: feed.stampsHeld(),
      peakLists: peak.lists,
      peakDeliveries: peak.deliveries,
      peakLastMoves: peak.lastMoves,
      envelopes,
      chat,
      cards: Object.keys(f.cards).length,
      deliveries: Object.keys(f.deliveries).length,
      lists: f.comments.length + f.progress.length + f.archives.length + f.unarchives.length + f.automationRuns.length + f.automationChanges.length,
      lastMoves: Object.keys(f.lastMoves).length,
      places: Object.keys(memory.places).length,
      movesSeen: Object.keys(memory.movesSeen).length,
      flights: Object.keys(memory.flights).length,
      lanes: Object.keys(memory.lanes).length,
      dmMessages: (await source.getDmMessages("g-man")).length,
      dmThreads: (await source.getDmThreads()).length,
    });
    envelopes = 0;
    chat = 0;
    peak.lists = 0;
    peak.deliveries = 0;
    peak.lastMoves = 0;
  };
  let pendingClose = false;
  source.start((message) => {
    if (message.type === "snapshot") {
      snapshots += 1;
      if (snapshots > 1) pendingClose = true;
    }
    if (message.type === "event") {
      envelopes += 1;
      if (message.envelope.type.startsWith("dm.")) chat += 1;
    }
    projection.apply(message);
    if (message.type === "event") samplePeak();
  });
  const wallPerLoop = SCRIPT_DURATION_MS / SPEED;
  let sent = 0;
  for (let wall = 0; wall < wallPerLoop * LOOPS - 1_000 && snapshots <= LOOPS; wall += WALL_STEP) {
    scheduler.advance(WALL_STEP);
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (pendingClose) {
      // Read right after the loop's snapshot: the lists the projection keeps across it and what the memory carries are
      // what a long session accumulates, and that is what must stay flat.
      pendingClose = false;
      await closeLoop();
    }
    // Three messages to an agent in the first loop; the source carries them into every later loop.
    if (snapshots === 1 && sent < 3 && wall > 10_000 * (sent + 1)) source.sendDm("g-man", `hello ${sent}`, `client-${sent++}`);
    const result = reduceWorld(projection.facts, memory, { now: source.now(), mode: "demo", roleOverrides: {} });
    memory = result.memory;
    feed.step(result.model);
  }
  assert.ok(loops.length >= LOOPS - 1, `${loops.length} loops closed`);
  assert.equal(sent, 3, "the three messages were sent in the first loop");
  const second = loops[1]!;
  assert.ok(second.chat > 0, "the carried chat plays in loop 2");
  assert.ok(second.peakLists > 0 && second.peakLastMoves > 0, "the loop's lists and moves were sampled before its end");
  for (let k = 2; k < loops.length; k++) {
    const l = loops[k]!;
    const at = `loop ${k + 1} vs loop 2`;
    assert.equal(l.envelopes, second.envelopes, `${at}: envelopes per loop`);
    assert.equal(l.chat, second.chat, `${at}: chat events per loop`);
    for (const key of ["cards", "deliveries", "lists", "lastMoves", "places", "movesSeen", "flights", "lanes", "dmMessages", "dmThreads", "peakLists", "peakDeliveries", "peakLastMoves"] as const) assert.ok(l[key] <= second[key], `${at}: ${key} ${l[key]} > ${second[key]}`);
    assert.ok(l.stamps <= DEFAULT_PRESENCE.plansPerDay, `${at}: the feed holds ${l.stamps} stamps, more than a day's`);
  }
  assert.ok(feed.usage().plansTotal > 0, "the feed made plans");
  assert.equal(projection.facts.invalidEvents, 0);
  console.log(`  manyLoops: loop 1 ${JSON.stringify(loops[0])}; loop 2 ${JSON.stringify(second)}; loop ${loops.length} ${JSON.stringify(loops[loops.length - 1])}`);
  projection.dispose();
});

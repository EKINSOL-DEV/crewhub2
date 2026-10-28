/* Round 45: the objects layer's celebrations over many loops. A ticket a person moved to done hops once per
   `celebrateUntil`; the layer remembered every `ticket:until` pair it ever played in a Set that nothing emptied (one new
   pair per demo loop, 90 a day at 1x). Now it keeps the last `until` per ticket and drops a ticket's entry with its
   object's state: many loops' worth of celebrations of the same tickets leave at most one entry per ticket, and none
   once the objects are gone, while every new celebration still plays. Round 47 (the review's F10): a gone object's entry
   stays until its `until` has passed (source time, `ctx.now`), so a ticket that comes back inside its celebration does
   not hop twice. */
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import type { ResolvedStyle } from "@crewhub/world-style";
import type { ObjectLayout, Placement } from "../src/world/interiorLayout.ts";
import { ObjectLayer, type ObjectLayerContext } from "../src/world/objectLayer.ts";
import { building, object } from "./fixtures.ts";

let sparkles = 0;
const style = {
  model: (key: string, options?: { size?: { width: number; height: number; depth: number } }) => {
    if (key === "sparkle") sparkles++;
    const size = options?.size ?? { width: 0.3, height: 0.2, depth: 0.2 };
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(size.width, size.height, size.depth), new THREE.MeshStandardMaterial());
    m.position.y = size.height / 2;
    g.add(m);
    return g;
  },
  color: () => new THREE.Color(),
} as unknown as ResolvedStyle;
let clock = 0;
const ctx: ObjectLayerContext = { style, now: () => clock, reducedMotion: () => false, truck: new THREE.Vector3(), surface: () => 0.5, shelfPitch: () => 0.3, theme: () => "day" };
const TICKETS = ["t1", "t2", "t3", "t4"];
const layout = (ids: string[]): ObjectLayout => {
  const placements = new Map<string, Placement>();
  ids.forEach((id, i) => placements.set(id, { room: "dispatch", x: 1 + i, z: 1, surface: "desk", level: 0, slot: `s${i}` }));
  return { placements, targets: new Map(), pallets: [] };
};

test("200 loops of celebrations of the same four tickets leave four entries, each new celebration plays, and the entries go with the objects", () => {
  const layer = new ObjectLayer("crewhub", ctx);
  const LOOPS = 200;
  for (let loop = 1; loop <= LOOPS; loop++) {
    // The same tickets, celebrated again each loop (the demo's clock moves, so `until` is new every loop).
    const objects = TICKETS.map((id) => object(id, "dispatch", { status: "done", celebrateUntil: loop * 60_000 }));
    layer.sync(building("crewhub", [], objects), layout(TICKETS));
    // The same model again within the loop: nothing plays twice for one `until`.
    layer.sync(building("crewhub", [], objects), layout(TICKETS));
    assert.equal(layer.celebratedCount, TICKETS.length, `loop ${loop}: one entry per ticket (the old Set kept every loop's pair)`);
  }
  assert.equal(sparkles, TICKETS.length * LOOPS, "every new celebration played once");
  // The objects leave the building once their last celebration has passed: their entries go with their states.
  clock = LOOPS * 60_000;
  layer.sync(building("crewhub", [], []), layout([]));
  assert.equal(layer.celebratedCount, 0, "no object, no entry");
  // Back with a fresh celebration: it plays, one entry each.
  const back = TICKETS.map((id) => object(id, "dispatch", { status: "done", celebrateUntil: (LOOPS + 1) * 60_000 }));
  layer.sync(building("crewhub", [], back), layout(TICKETS));
  assert.equal(layer.celebratedCount, TICKETS.length);
  assert.equal(sparkles, TICKETS.length * (LOOPS + 1));
});

test("a ticket that leaves and comes back inside its celebration hops once; its entry goes once the celebration has passed (round 47)", () => {
  clock = 0;
  const layer = new ObjectLayer("crewhub", ctx);
  const before = sparkles;
  const done = [object("t1", "dispatch", { status: "done", celebrateUntil: 5_000 })];
  layer.sync(building("crewhub", [], done), layout(["t1"]));
  assert.equal(sparkles - before, 1, "the celebration plays");
  // A model without it (a re-snapshot, a move away and back), then the same celebration again, all inside its window.
  clock = 2_000;
  layer.sync(building("crewhub", [], []), layout([]));
  assert.equal(layer.celebratedCount, 1, "the gone object's entry stays while its celebration runs");
  layer.sync(building("crewhub", [], done), layout(["t1"]));
  assert.equal(sparkles - before, 1, "back inside its window: no second hop");
  // Gone again, and the celebration has passed: the entry goes at that sync.
  clock = 5_000;
  layer.sync(building("crewhub", [], []), layout([]));
  assert.equal(layer.celebratedCount, 0, "no object and the celebration over: no entry");
});

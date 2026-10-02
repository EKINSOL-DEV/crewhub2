import assert from "node:assert/strict";
import test from "node:test";
import { approachCells, occupancy, validateLayout, type Cell } from "@crewhub/world-engine";
import type { RoomKind } from "@crewhub/world-model";
import { buildingTemplate, dressingZones, interiorDefinitions, LOADING, type BuildingTemplate } from "../src/world/buildingTemplate.ts";
import { NavWorld } from "../src/world/navigation.ts";
import { DRESS_PREFIX, dressingSeed, roomDecor } from "../src/world/roomDressing.ts";
import { agent, building } from "./fixtures.ts";

/** Buildings with every room kind, at several agent counts, and a few slugs (the dressing is seeded per building). */
const variants = [0, 1, 2, 3, 5, 8].flatMap((n) =>
  ["cr", "ops", "lab"].map((slug) =>
    building(
      `${slug}${n}`,
      [
        ...Array.from({ length: n }, (_, i) => agent(`${slug}${n}/dev-${i}`, "workers")),
        ...Array.from({ length: Math.min(n, 4) }, (_, i) => agent(`${slug}${n}/analyst-${i}`, "analyst")),
        ...Array.from({ length: Math.min(n, 3) }, (_, i) => agent(`${slug}${n}/design-${i}`, "design")),
      ],
      [],
      n % 2 ? ["meeting"] : [],
    ),
  ),
);

const undressed = (t: BuildingTemplate): BuildingTemplate => ({
  ...t,
  rooms: t.rooms.map((r) => ({ ...r, layout: { ...r.layout, props: r.layout.props.filter((p) => !p.id.startsWith(DRESS_PREFIX)) } })),
});

function reachable(layout: BuildingTemplate["rooms"][number]["layout"]): (c: Cell) => boolean {
  const { width, depth } = layout.grid;
  const blocked = occupancy(layout, interiorDefinitions);
  const seen = new Uint8Array(width * depth);
  const queue = [layout.entrance];
  seen[layout.entrance.z * width + layout.entrance.x] = 1;
  while (queue.length) {
    const c = queue.pop()!;
    for (const n of [
      { x: c.x - 1, z: c.z },
      { x: c.x + 1, z: c.z },
      { x: c.x, z: c.z - 1 },
      { x: c.x, z: c.z + 1 },
    ]) {
      const i = n.z * width + n.x;
      if (n.x < 0 || n.z < 0 || n.x >= width || n.z >= depth || seen[i] || blocked[i] !== -1) continue;
      seen[i] = 1;
      queue.push(n);
    }
  }
  return (c) => c.x >= 0 && c.z >= 0 && c.x < width && c.z < depth && seen[c.z * width + c.x] === 1;
}

test("every room kind is dressed, and the dressing is deterministic per building", () => {
  const dressedKinds = new Set<RoomKind>();
  for (const b of variants) {
    const template = buildingTemplate(b);
    assert.deepEqual(buildingTemplate(b), template, `${b.slug}: the same building dresses the same way`);
    const decor = roomDecor(template, { definitions: interiorDefinitions, seed: dressingSeed(b.slug), zones: dressingZones(template), loading: LOADING });
    for (const room of template.rooms) {
      const pieces = room.layout.props.filter((p) => p.id.startsWith(DRESS_PREFIX)).length + decor.filter((d) => d.room === room.kind).length;
      if (pieces) dressedKinds.add(room.kind);
      for (const p of room.layout.props) assert.ok(interiorDefinitions[p.definitionId], `${b.slug}: ${p.definitionId} has a definition`);
    }
    for (const d of decor) assert.match(d.key, /^decor\./, `${b.slug}: non-blocking dressing uses decor keys`);
  }
  assert.deepEqual([...dressedKinds].sort(), ["analyst", "design", "dispatch", "lead-office", "lobby", "meeting", "planning", "review", "storage", "workers"]);
  // Neighbouring buildings vary a little.
  const looks = new Set(["cr3", "ops3", "lab3"].map((slug) => JSON.stringify(buildingTemplate(variants.find((b) => b.slug === slug)!).rooms.map((r) => r.layout.props))));
  assert.ok(looks.size > 1, "different buildings dress differently");
});

test("the dressing keeps every door, seat, desk approach and pile approach of every room reachable", () => {
  for (const b of variants) {
    const template = buildingTemplate(b);
    const bare = undressed(template);
    for (const room of template.rooms) {
      assert.doesNotThrow(() => validateLayout(room.layout, interiorDefinitions), `${b.slug}/${room.kind}: no overlaps, inside the room`);
      const before = reachable(bare.rooms.find((r) => r.kind === room.kind)!.layout);
      const after = reachable(room.layout);
      const doors = template.doors.flatMap((d) => [d.a, d.b]).filter((s) => s.room === room.kind).map((s) => s.cell);
      for (const door of doors) assert.ok(after(door), `${b.slug}/${room.kind}: door ${door.x},${door.z} stays reachable`);
      for (const prop of room.layout.props.filter((p) => !p.id.startsWith(DRESS_PREFIX)))
        for (const a of approachCells(prop, interiorDefinitions))
          if (before(a)) assert.ok(after(a), `${b.slug}/${room.kind}: ${prop.id}'s approach ${a.x},${a.z} stays reachable`);
    }
  }
});

test("through the building navigation, every seat, pile and the mailbox can be reached from the lobby", () => {
  for (const b of variants) {
    // One building per town: the town has plots for a dozen buildings, not for every variant at once.
    const nav = new NavWorld();
    nav.sync([b]);
    const lobby = nav.lobby(b.slug)!;
    for (const a of b.agents) {
      const home = nav.home(b.slug, a.key, a.room);
      assert.ok(home && nav.canReach(lobby, home), `${b.slug}: ${a.key}'s place is reachable`);
    }
    for (const kind of ["storage", "planning", "review", "dispatch"] as const) {
      const spots = nav.spots(b.slug, "pile", kind);
      assert.ok(spots.length > 0, `${b.slug}/${kind}: the pile has an approach`);
      for (const spot of spots) assert.ok(nav.canReach(lobby, spot), `${b.slug}/${kind}: pile approach reachable`);
    }
    for (const tag of ["mail", "coffee"]) assert.ok(nav.reachableSpots(b.slug, tag, "lobby").length > 0, `${b.slug}: ${tag} spot reachable`);
    if (b.rooms.some((r) => r.kind === "meeting")) assert.ok(nav.around(b.slug, "gather", "meeting").length >= 4, `${b.slug}: room to gather round the table`);
  }
});

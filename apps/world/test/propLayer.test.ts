/* Round 24: the props of the town document built ahead of the enter (world/propLayer.ts, `prepare`): hidden, kept
   across the syncs of the town view until the enter reuses them or the interior is released, never materialising,
   never priming the layer, and build mode's ghost and selection left alone. */
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import type { ResolvedStyle } from "@crewhub/world-style";
import type { RuleProp } from "@crewhub/world-model";
import { PropLayer, type SyncInput, type TownLayer } from "../src/world/propLayer.ts";
import { buildingTemplate } from "../src/world/buildingTemplate.ts";
import { building } from "./fixtures.ts";

const style = {
  model: (key: string) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial());
    m.name = key;
    g.add(m);
    return g;
  },
  parts: () => new THREE.Group(),
  color: () => new THREE.Color(),
  materialise: () => undefined,
} as unknown as ResolvedStyle;
const b = building("crewhub");
const template = buildingTemplate(b);
const rule = (id: string, key: RuleProp["key"]): RuleProp => ({ id, rule: "milestone" as RuleProp["rule"], key, anchor: { kind: "room", building: "crewhub", room: "lobby" }, count: null, text: "" });
const town = (extra: Partial<TownLayer> = {}): TownLayer => ({ doc: { placements: [] } as unknown as TownLayer["doc"], catalogue: new Map() as unknown as TownLayer["catalogue"], definitions: {}, rules: [rule("rule:banner:crewhub:m1", "banner"), rule("rule:crate:crewhub:c1", "crate")], invalid: [], fresh: new Set(), build: null, ...extra });
const input = (detailed: boolean, prepare = false, extra: Partial<TownLayer> = {}): SyncInput => ({ building: b, template, placements: { rooms: new Map(), errors: [] }, desks: new Map(), town: town(extra), detailed, prepare });
const layer = () => new PropLayer({ style, slug: "crewhub", reducedMotion: () => false, surface: () => 0.5, toWorld: (v) => v.clone() });

test("prepare builds the props hidden and keeps them across the town view's syncs; the enter shows the same objects; leaving prunes as before", () => {
  const props = layer();
  props.sync(input(true, true));
  assert.equal(props.group.visible, false, "built ahead, not shown");
  assert.equal(props.prepared, true);
  assert.equal(props.group.children.length, 2, "the two rule props");
  const made = [...props.group.children];
  props.sync(input(false));
  assert.deepEqual(props.group.children, made, "a sync of the town view keeps what was built ahead");
  props.sync(input(true));
  assert.equal(props.group.visible, true);
  assert.equal(props.prepared, false, "entered: a real sync, the layer primed from here on");
  assert.deepEqual(props.group.children, made, "the enter shows the objects built ahead, nothing made again");
  props.sync(input(false));
  assert.equal(props.group.children.length, 0, "left: pruned, as before the round");
});

test("release drops what was built ahead at the next sync of the town view; an archived building's goes at once", () => {
  const props = layer();
  props.sync(input(true, true));
  assert.equal(props.group.children.length, 2);
  props.release();
  assert.equal(props.prepared, false);
  props.sync(input(false));
  assert.equal(props.group.children.length, 0);
  props.sync(input(true, true));
  assert.equal(props.group.children.length, 2);
  props.sync({ ...input(false), building: { ...b, archived: true } });
  assert.equal(props.group.children.length, 0, "archived: nothing kept");
});

test("prepare makes no ghost and no selection, and does not prime the layer (a rule prop at the enter does not materialise)", () => {
  const props = layer();
  const build = { on: true, ghost: { id: null, propId: "builtin:plant", room: "lobby" as const, cell: { x: 0, z: 0 }, rotation: 0 as const, valid: true }, selected: null, theme: "day" as const };
  props.sync(input(true, true, { build, definitions: { "builtin:plant": { id: "builtin:plant", size: { width: 1, depth: 1 }, kind: "prop", tags: [] } as never } }));
  assert.equal(props.group.children.length, 2, "the rule props only: no ghost tile, no selection");
  // A rule prop that appears after the prepare: at the enter the layer is not primed, so it stands at once (no materialise).
  const more = town({ rules: [rule("rule:banner:crewhub:m1", "banner"), rule("rule:crate:crewhub:c1", "crate"), rule("rule:jar:crewhub:j1", "jar")] });
  props.sync({ ...input(true), town: more });
  assert.equal(props.group.children.length, 3);
});

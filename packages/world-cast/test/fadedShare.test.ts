/* Round 42: faded figures (a proxy, or a stale one) share their see-through copies per kit material and mode
   (runtime.ts, acquireFaded/releaseFaded): N faded figures cost one copy per kit material they use, a look change clones
   nothing, the last figure leaving a copy disposes it, and a disposed kit material takes its copies with it. Before,
   every faded figure cloned its ten visible parts' materials and disposed and re-cloned them at each state change. */
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { createCast, referenceKit, type CastManifest, type FigureHandle, type FigureSpec, type FigureState } from "../src/index.ts";
import { fadedCopiesAlive } from "../src/runtime.ts";
import { figurePiecesOf } from "@crewhub/world-style";

const manifest: CastManifest = {
  format: "crewhub-cast/1",
  id: "pegs",
  name: "Pegs",
  version: "1.0.0",
  description: "A peg with a head.",
  colors: { wood: { day: "#bf9873", lamplight: "#bf9873" }, pale: { day: "#f2ecdc", lamplight: "#f2ecdc" }, stale: { day: "#9a9a9a", lamplight: "#9a9a9a" } },
  budget: { nearTriangles: 400, farTriangles: 200, nearMeshes: 4, farMeshes: 2 },
};
const spec: FigureSpec = {
  format: "crewhub-figure/1",
  joints: [
    { id: "body", position: [0, 0.2, 0] },
    { id: "head", parent: "body", position: [0, 0.6, 0] },
  ],
  parts: [
    { id: "peg", joint: "body", shape: "cylinder", size: [0.2, 0.6, 0.2], position: [0, 0.3, 0], color: "slot:coat" },
    { id: "knob", joint: "head", shape: "sphere", size: [0.2, 0.2, 0.2], position: [0, 0, 0], color: "pale" },
    { id: "lamp", joint: "head", shape: "box", size: [0.1, 0.1, 0.1], position: [0, 0.2, 0], color: "wood", glow: 0.4, detail: "near" },
    { id: "flag", joint: "head", shape: "box", size: [0.1, 0.1, 0.02], position: [0, 0.3, 0], color: "pale", waiting: true },
  ],
  poses: { working: { head: { rotation: [10, 0, 0] } } },
  motions: { working: [{ joint: "head", channel: "rotation.y", wave: "sine", amplitude: 90, period: 4 }] },
  looks: { working: { parts: { knob: { glow: 0.5 } } }, alert: { parts: { peg: { color: "pale" } } } },
  colorways: { coat: { lead: "soft:accent", others: ["wood", "pale"] } },
  anchors: { label: [0, 1.1, 0], carry: [0, 0.4, 0.3], ground: 0.25, height: 1 },
} as unknown as FigureSpec;

const idle: FigureState = { activity: "idle", waiting: false, alert: false, proxy: false, carrying: false };
const proxy: FigureState = { ...idle, proxy: true };
const stale: FigureState = { ...idle, activity: "stale" };

/** Every material the figures' pieces draw with now, and the kit materials among them (those the kit handed out). */
function drawnMaterials(handles: FigureHandle[]) {
  const all = new Set<THREE.Material>();
  for (const h of handles) h.object.traverse((o) => { const holder = figurePiecesOf(o); if (holder) for (const p of holder.figurePieces) all.add(p.material); });
  return all;
}

function figures(n: number) {
  const kit = referenceKit(manifest.colors);
  const cast = createCast(manifest, spec, kit);
  const handles = Array.from({ length: n }, (_, i) => cast.figure({ key: `share:${i}`, role: i % 3 === 0 ? "lead" : "worker", accent: i % 2 ? "coral" : null }));
  for (const h of handles) h.setDetail("far");
  return { kit, handles };
}

test("200 figures flipped between faded and not: one copy per kit material in use, none when none is faded, nothing re-cloned by a look change", () => {
  const { handles } = figures(200);
  let cloned = 0, disposed = 0;
  const clone = THREE.MeshStandardMaterial.prototype.clone;
  THREE.MeshStandardMaterial.prototype.clone = function () {
    cloned++;
    const m = clone.call(this);
    m.addEventListener("dispose", () => disposed++);
    return m;
  };
  try {
    const kitMaterials = drawnMaterials(handles); // not faded: the kit's shared materials
    assert.equal(fadedCopiesAlive(), 0, "no copy while none is faded");
    for (const h of handles) h.setState(proxy);
    const proxies = drawnMaterials(handles);
    const sources = new Set([...kitMaterials].filter((m) => (m as THREE.MeshStandardMaterial).isMeshStandardMaterial));
    // One copy per kit material in use: as many copies as distinct kit materials the far parts draw with, and no kit material drawn directly.
    assert.equal(fadedCopiesAlive(), proxies.size, "the copies drawn are the copies alive");
    assert.ok(proxies.size >= 2 && proxies.size <= sources.size, `copies ${proxies.size} for ${sources.size} kit materials`);
    for (const m of proxies) assert.ok(!kitMaterials.has(m), "a faded figure draws no kit material directly");
    assert.equal(cloned, proxies.size, "one clone per copy");
    const copies = proxies.size;
    // The invariant at every step: the copies alive are exactly the distinct materials the faded figures draw, and
    // every copy made that is not alive was disposed.
    const invariant = (what: string) => {
      const drawn = drawnMaterials(handles);
      assert.equal(fadedCopiesAlive(), drawn.size, `${what}: copies alive = distinct copies drawn`);
      assert.equal(cloned - disposed, fadedCopiesAlive(), `${what}: made - disposed = alive`);
      for (const m of drawn) assert.ok(!kitMaterials.has(m), `${what}: a faded figure draws no kit material directly`);
    };
    // 400 look changes while faded (alert on, then waiting on): a look that swaps a part to a kit material no copy
    // exists for yet makes that one copy; the same changes again make nothing.
    const flips = () => {
      for (let i = 0; i < 200; i++) handles[i]!.setState({ ...proxy, alert: true });
      for (let i = 0; i < 200; i++) handles[i]!.setState({ ...proxy, waiting: true });
    };
    flips();
    invariant("after the look changes");
    const made = cloned;
    assert.ok(made <= copies + 2, `at most one new copy per kit material the looks bring in (${made} for ${copies} at the start)`);
    flips();
    invariant("after the look changes again");
    assert.ok(cloned - made <= 2, `a wholesale look change of all 200 figures re-makes at most the copies the last holder let go (${cloned - made}), never one per figure`);
    // One figure's look flips 200 times while the others hold the copies: nothing is cloned.
    const one = handles[7]!;
    const before = cloned;
    for (let i = 0; i < 200; i++) one.setState({ ...proxy, alert: i % 2 === 0 });
    assert.equal(cloned, before, "one figure's look changes clone nothing");
    assert.equal(disposed, cloned - fadedCopiesAlive(), "and dispose nothing of what others hold");
    invariant("after one figure's 200 look changes");
    // Flip every figure out and back, one at a time: the copies stay while any other figure holds them.
    for (let i = 0; i < 200; i++) {
      handles[i]!.setState(idle);
      handles[i]!.setState(proxy);
    }
    assert.equal(cloned, before, "flipping one figure out and back clones nothing while others hold the copies");
    invariant("after flipping each figure out and back");
    // Half go stale: the stale copies are others, one per kit material, and the proxy copies stay for the other half.
    for (let i = 0; i < 100; i++) handles[i]!.setState(stale);
    const mixed = drawnMaterials(handles);
    assert.equal(fadedCopiesAlive(), mixed.size);
    assert.equal(mixed.size, copies * 2, "proxy and stale copies, one set each");
    for (const m of mixed) {
      const s = m as THREE.MeshStandardMaterial;
      assert.equal(s.transparent, true);
      if (s.opacity === 0.35) assert.equal(s.depthWrite, false, "a proxy copy writes no depth");
      else {
        assert.equal(s.opacity, 0.8, "a stale copy's opacity");
        assert.equal(s.depthWrite, true);
      }
    }
    // Everyone back: every copy disposed, none alive.
    for (const h of handles) h.setState(idle);
    assert.equal(fadedCopiesAlive(), 0, "none faded, no copy");
    assert.equal(disposed, cloned, "every copy made was disposed");
    assert.deepEqual(drawnMaterials(handles), kitMaterials, "the kit's materials again");
    // Faded again: new copies (the old are gone), still one per kit material.
    for (const h of handles) h.setState(proxy);
    assert.equal(fadedCopiesAlive(), copies);
    // Disposing figures releases their holds; the last one drops the copies.
    for (const h of handles) h.dispose();
    assert.equal(fadedCopiesAlive(), 0, "disposed figures hold nothing");
  } finally {
    THREE.MeshStandardMaterial.prototype.clone = clone;
  }
});

test("a stale copy's colour is the kit material's lerped towards the kit's stale colour, and a disposed kit material takes its copies with it", () => {
  const { kit, handles } = figures(3);
  for (const h of handles) h.setState(stale);
  const copies = [...drawnMaterials(handles)] as THREE.MeshStandardMaterial[];
  const staleColor = new THREE.Color(kit.hex("stale"));
  const kitColors = new Map<THREE.Material, THREE.Color>();
  for (const h of handles) { h.setState(idle); h.object.traverse((o) => { const holder = figurePiecesOf(o); if (holder) for (const p of holder.figurePieces) kitColors.set(p.material, (p.material as THREE.MeshStandardMaterial).color); }); h.setState(stale); }
  let matched = 0;
  for (const copy of copies) for (const [, color] of kitColors) {
    const expected = color.clone().lerp(staleColor, 0.75);
    if (Math.abs(expected.r - copy.color.r) < 1e-6 && Math.abs(expected.g - copy.color.g) < 1e-6 && Math.abs(expected.b - copy.color.b) < 1e-6) matched++;
  }
  assert.ok(matched >= copies.length, `every stale copy's colour is a kit colour lerped 0.75 towards stale (${matched} matches for ${copies.length} copies)`);
  const alive = fadedCopiesAlive();
  assert.ok(alive >= copies.length);
  for (const source of kitColors.keys()) source.dispose();
  assert.equal(fadedCopiesAlive(), alive - copies.length, "the kit materials' dispose took their copies");
});

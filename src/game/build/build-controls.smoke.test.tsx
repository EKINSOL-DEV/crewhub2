// R3F render smoke (M3 T4): @react-three/test-renderer builds the three.js
// scene graph without a real WebGL context (jsdom), same setup as
// campus-world.smoke.test.tsx — the ghost preview needs a model to clone,
// so useGLTF is stubbed the same way.
//
// Coverage split (per dispatch): the ground-plane pointer path (hover ->
// place, tool-gated validity) is exercised here through the real R3F event
// system via fireEvent, since that's the part @/game/build/mode.test.ts and
// store.test.ts can't reach. Select-tool rotate/delete just call
// useCampusEdits' rotateItem/removeItem directly — already covered by
// store.test.ts — so they aren't re-verified through a synthetic click on a
// tiny pick-cylinder mesh here, which would be brittle for no extra signal.
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReactThreeTestRenderer, { type ReactThreeTest } from "@react-three/test-renderer";
import * as THREE from "three";

/** #rrggbb -> 0xrrggbb, matching how three.js normalizes `Color.set()` input. */
function hex(color: string): number {
  return parseInt(color.slice(1), 16);
}

vi.mock("@/ipc/bindings", () => ({
  commands: {
    getSetting: vi.fn(async () => ({ status: "ok", data: null })),
    setSetting: vi.fn(async () => ({ status: "ok", data: null })),
  },
}));

vi.mock("@react-three/drei", async (importOriginal) => {
  const real = await importOriginal<typeof import("@react-three/drei")>();
  const fakeGltf = () => {
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
    return { scene };
  };
  const useGLTF = Object.assign(vi.fn(fakeGltf), { preload: vi.fn(), clear: vi.fn() });
  return { ...real, useGLTF };
});

import { BuildControls } from "./BuildControls";
import { useBuildMode } from "./mode";
import { resetCampusEditsForTests, useCampusEdits } from "./store";

/** The ground-pick plane is the only mesh wired for both events — item/
 *  building pick proxies (select tool only) never carry onPointerMove. */
function groundPlane(instance: ReactThreeTest.ReactThreeTestInstance): ReactThreeTest.ReactThreeTestInstance {
  const matches = instance.findAll(
    (node) =>
      typeof node.props.onPointerMove === "function" && typeof node.props.onPointerDown === "function",
  );
  expect(matches).toHaveLength(1);
  return matches[0]!;
}

/** A placed item/building's pick proxy: onPointerDown only, no onPointerMove
 *  (only the ground plane carries both — see groundPlane above). */
function pickProxy(instance: ReactThreeTest.ReactThreeTestInstance): ReactThreeTest.ReactThreeTestInstance {
  const matches = instance.findAll(
    (node) =>
      typeof node.props.onPointerDown === "function" && typeof node.props.onPointerMove !== "function",
  );
  expect(matches).toHaveLength(1);
  return matches[0]!;
}

describe("BuildControls smoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCampusEditsForTests();
    useBuildMode.setState({ active: true, tool: { kind: "item", item: "bush" }, pendingRoomLink: null });
  });

  it("places on a valid spot, snapped to the grid", async () => {
    const renderer = await ReactThreeTestRenderer.create(<BuildControls />);
    const ground = groundPlane(renderer.scene);

    // (16.4, 4.6): hypot ≈16.76, clear of the plaza's (grown alongside HQ,
    // M9) radius-11 circular margin.
    await renderer.fireEvent(ground, "pointerMove", { point: { x: 16.4, y: 0, z: 4.6 } });
    await renderer.fireEvent(ground, "pointerDown", { point: { x: 16.4, y: 0, z: 4.6 }, button: 0 });

    const items = useCampusEdits.getState().edits.items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "bush", x: 16, z: 5, rot: 0 });

    await renderer.unmount();
  });

  it("does not place on an invalid spot (inside the plaza)", async () => {
    const renderer = await ReactThreeTestRenderer.create(<BuildControls />);
    const ground = groundPlane(renderer.scene);

    await renderer.fireEvent(ground, "pointerDown", { point: { x: 0, y: 0, z: 0 }, button: 0 });

    expect(useCampusEdits.getState().edits.items).toHaveLength(0);
    await renderer.unmount();
  });

  it("ignores a right-click on the ground plane", async () => {
    const renderer = await ReactThreeTestRenderer.create(<BuildControls />);
    const ground = groundPlane(renderer.scene);

    await renderer.fireEvent(ground, "pointerDown", { point: { x: 10, y: 0, z: 5 }, button: 2 });

    expect(useCampusEdits.getState().edits.items).toHaveLength(0);
    await renderer.unmount();
  });

  it("the building tool anchors on the first click and commits a valid rect on the second", async () => {
    useBuildMode.setState({ active: true, tool: { kind: "building" } });
    const renderer = await ReactThreeTestRenderer.create(<BuildControls />);
    const ground = groundPlane(renderer.scene);

    await renderer.fireEvent(ground, "pointerDown", { point: { x: 0, y: 0, z: 27 }, button: 0 });
    expect(useCampusEdits.getState().edits.buildings).toHaveLength(0); // anchor only, no commit yet

    await renderer.fireEvent(ground, "pointerDown", { point: { x: 6, y: 0, z: 33 }, button: 0 });
    const buildings = useCampusEdits.getState().edits.buildings;
    expect(buildings).toHaveLength(1);
    expect(buildings[0]).toMatchObject({ x: 3, z: 30, w: 6, d: 6 });
    // A commit opens RoomLinkDialog (GameShell mounts it off this field) targeting the new building.
    expect(useBuildMode.getState().pendingRoomLink).toBe(buildings[0]!.id);

    await renderer.unmount();
  });

  it("a second building click on an invalid rect cancels the anchor instead of leaving it dangling", async () => {
    useBuildMode.setState({ active: true, tool: { kind: "building" } });
    const renderer = await ReactThreeTestRenderer.create(<BuildControls />);
    const ground = groundPlane(renderer.scene);

    // Anchor, then close a rect below the 6x5 minimum — rejected.
    await renderer.fireEvent(ground, "pointerDown", { point: { x: 0, y: 0, z: 20 }, button: 0 });
    await renderer.fireEvent(ground, "pointerDown", { point: { x: 1, y: 0, z: 21 }, button: 0 });
    expect(useCampusEdits.getState().edits.buildings).toHaveLength(0);

    // If the anchor were left dangling at (0, 20) instead of cleared, this
    // click would pair with it into a perfectly valid 8x6 rect and commit a
    // building — so a still-empty list here proves the anchor was reset,
    // and this click just started a fresh (uncommitted) one instead.
    await renderer.fireEvent(ground, "pointerDown", { point: { x: 8, y: 0, z: 26 }, button: 0 });
    expect(useCampusEdits.getState().edits.buildings).toHaveLength(0);

    await renderer.unmount();
  });

  it("the building ghost turns invalid (red) over HQ's footprint at the origin (M6 T5)", async () => {
    useBuildMode.setState({ active: true, tool: { kind: "building" } });
    const renderer = await ReactThreeTestRenderer.create(<BuildControls />);
    const ground = groundPlane(renderer.scene);

    // Anchor + hover a rect straddling the origin — well above the 6x5
    // minimum (so the size guard doesn't confound the assertion), still
    // squarely over HQ's 18x14 footprint. canPlaceBuilding (edits.ts) already
    // has a unit test pinning `{x:0,z:0,w:6,d:5}` as rejected; this is the
    // same invariant, exercised through the actual ghost-preview material the
    // player sees rather than the pure predicate.
    await renderer.fireEvent(ground, "pointerDown", { point: { x: -4, y: 0, z: -3 }, button: 0 });
    await renderer.fireEvent(ground, "pointerMove", { point: { x: 4, y: 0, z: 3 } });
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(1, 0.1);
    });

    // The item ghost's fake-GLTF stub (top of file) is also an always-mounted
    // BoxGeometry mesh (1x1x1, hidden while a non-item tool is active) — the
    // rect preview's distinctive `boxGeometry args={[1, 0.2, 1]}` (a flat
    // slab) is what tells the two apart here.
    const previewMeshes = renderer.scene.findAllByType("Mesh").filter((m) => {
      const geo = (m.instance as unknown as THREE.Mesh).geometry as THREE.BoxGeometry;
      return geo.type === "BoxGeometry" && geo.parameters.height === 0.2;
    });
    expect(previewMeshes).toHaveLength(1);
    const material = (previewMeshes[0]!.instance as unknown as THREE.Mesh)
      .material as THREE.MeshBasicMaterial;
    expect(material.color.getHex()).toBe(hex("#ef4444"));
    // Never committed — an invalid rect must not silently place a building.
    expect(useCampusEdits.getState().edits.buildings).toHaveLength(0);

    await renderer.unmount();
  });

  it("select tool never renders a pick proxy for HQ — proxies only ever come from edits.buildings, which HQ is never a member of", async () => {
    // HQ is baked into campusBuildings() (the seeded, non-edit layout) and
    // canPlaceBuilding rejects any player-built rect overlapping its
    // footprint (edits.test.ts), so edits.buildings can never contain an HQ
    // entry — this is a documentation/regression pin on that invariant
    // rather than new coverage: with zero placed buildings, zero building
    // pick proxies exist, full stop.
    useBuildMode.setState({ active: true, tool: { kind: "select" } });
    const renderer = await ReactThreeTestRenderer.create(<BuildControls />);

    // Building pick proxies (unlike the always-mounted, normally-hidden
    // building-rect preview mesh) carry onPointerDown and a box geometry
    // sized to the building's own w/d — that combination is what
    // distinguishes a real proxy from the preview mesh, which has neither a
    // handler nor HQ's dimensions.
    const buildingProxies = renderer.scene
      .findAllByType("Mesh")
      .filter(
        (m) =>
          typeof m.props.onPointerDown === "function" &&
          (m.instance as unknown as THREE.Mesh).geometry.type === "BoxGeometry",
      );
    expect(buildingProxies).toHaveLength(0);

    await renderer.unmount();
  });

  it("select-tool drag calls moveItem only on an actual cell change, snapped and validity-gated", async () => {
    useCampusEdits.getState().addItem("bush", 10, 10, 0);
    const id = useCampusEdits.getState().edits.items[0]!.id;
    // Spied before mount so BuildControls' `useCampusEdits((s) => s.moveItem)`
    // selector picks up the wrapped function — it still calls through, so
    // the store updates for real.
    const moveItemSpy = vi.spyOn(useCampusEdits.getState(), "moveItem");

    useBuildMode.setState({ active: true, tool: { kind: "select" } });
    const renderer = await ReactThreeTestRenderer.create(<BuildControls />);
    const proxy = pickProxy(renderer.scene);
    const ground = groundPlane(renderer.scene);

    await renderer.fireEvent(proxy, "pointerDown", { button: 0 }); // select + start drag

    // Moving onto the item's own current cell is a no-op — no write.
    await renderer.fireEvent(ground, "pointerMove", { point: { x: 10, y: 0, z: 10 } });
    expect(moveItemSpy).not.toHaveBeenCalled();

    // Moving to a new, valid cell writes the snapped coordinates.
    await renderer.fireEvent(ground, "pointerMove", { point: { x: 15.4, y: 0, z: 12.6 } });
    expect(moveItemSpy).toHaveBeenCalledWith(id, 15, 13);
    expect(moveItemSpy).toHaveBeenCalledTimes(1);
    expect(useCampusEdits.getState().edits.items[0]).toMatchObject({ x: 15, z: 13 });

    await renderer.unmount();
  });

  it("throttles a held `]` key to at most one rotateItem call per 250ms", async () => {
    vi.useFakeTimers();
    try {
      useCampusEdits.getState().addItem("bush", 10, 10, 0);
      const id = useCampusEdits.getState().edits.items[0]!.id;
      const rotateItemSpy = vi.spyOn(useCampusEdits.getState(), "rotateItem");

      useBuildMode.setState({ active: true, tool: { kind: "select" } });
      const renderer = await ReactThreeTestRenderer.create(<BuildControls />);
      const proxy = pickProxy(renderer.scene);
      await renderer.fireEvent(proxy, "pointerDown", { button: 0 }); // select the item

      // Browser auto-repeat fires far faster than 4/s — 20 keydowns 10ms
      // apart (190ms total), well inside the 250ms throttle window.
      for (let i = 0; i < 20; i++) {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "]" }));
        vi.advanceTimersByTime(10);
      }
      expect(rotateItemSpy).toHaveBeenCalledTimes(1);
      expect(rotateItemSpy).toHaveBeenCalledWith(id, 1);

      // Past the 250ms window, the next keydown is allowed through again.
      vi.advanceTimersByTime(100); // ~290ms since the first call
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "]" }));
      expect(rotateItemSpy).toHaveBeenCalledTimes(2);

      await renderer.unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});

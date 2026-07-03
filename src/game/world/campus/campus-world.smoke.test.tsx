// R3F render smoke (M0 T9): @react-three/test-renderer builds the three.js
// scene graph without a real WebGL context, so this runs under jsdom.
//
// useGLTF cannot fetch in jsdom — mock it to return a tiny toon model.
// <Merged> instances by imperatively writing into an InstancedMesh's buffer
// on layout effect; under the headless test renderer (no GL, no rAF) that
// never shows up in the scene graph, so no InstancedMesh nodes appear at
// all. Stub it here with the same render-prop contract but each Part
// renders a plain <mesh> instead of an instance, and assert on Mesh counts
// instead — layout, hierarchy and the rest of drei are still the real thing.
//
// Text/Billboard (RoofPlate, M5 T4) are also stubbed here: the real drei
// <Text> suspends forever in jsdom (no font can load, per the M1 lesson),
// which is fine for a "does it mount" count (its Suspense fallback just
// stays null, contributing zero meshes) but useless for the "does the plate
// text actually update live" test below, which needs to read the label
// synchronously. Same convention as flavor-ui.test.tsx's SpeechBubble/
// ThoughtBubble stubs: render a `<group name="plate:...">` marker instead of
// real text — a `group`, not a `mesh`, so it never perturbs the exact
// mesh-count assertions elsewhere in this file.
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import * as THREE from "three";
import type { ComponentType } from "react";

vi.mock("@react-three/drei", async (importOriginal) => {
  const real = await importOriginal<typeof import("@react-three/drei")>();
  const fakeGltf = () => {
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
    return { scene };
  };
  const useGLTF = Object.assign(vi.fn(fakeGltf), { preload: vi.fn(), clear: vi.fn() });
  const Merged = ({
    meshes,
    children,
  }: {
    meshes: THREE.Mesh[];
    children: (...parts: ComponentType[]) => React.ReactNode;
  }) => {
    const Parts = meshes.map(
      (mesh) =>
        function Part() {
          return <mesh geometry={mesh.geometry} material={mesh.material} />;
        },
    );
    return <>{children(...Parts)}</>;
  };
  const Text = ({ children }: { children?: React.ReactNode }) => <group name={`plate:${String(children)}`} />;
  const Billboard = ({
    children,
    position,
  }: {
    children?: React.ReactNode;
    position?: [number, number, number];
  }) => <group position={position ?? [0, 0, 0]}>{children}</group>;
  return { ...real, useGLTF, Merged, Text, Billboard };
});

vi.mock("@/ipc/bindings", () => ({
  commands: {
    getSetting: vi.fn(async () => ({ status: "ok", data: null })),
    setSetting: vi.fn(async () => ({ status: "ok", data: null })),
  },
}));

// HqProps' 🧰 stand (M6 T4) opens a native window rather than touching the
// card slot — same mock convention as hud-windows.test.tsx.
vi.mock("@/game/app/windows", () => ({
  openWorkspaceWindow: vi.fn(),
  openSettingsWindow: vi.fn(),
}));

// M8 T3: the rig's live yaw (see live-camera.ts) is mocked here so a test
// can prove the click handler actually threads its return value into
// focusBuilding, rather than always seeding 0 — real math for
// focusForBuilding's own door-selection logic is director.test.ts's job.
vi.mock("@/game/engine/camera/live-camera", () => ({
  getLiveYaw: vi.fn(() => 0),
  setLiveYaw: vi.fn(),
}));

import { openWorkspaceWindow } from "@/game/app/windows";
import { CampusWorld } from "./CampusWorld";
import { campusLayout } from "./layout";
import { resetCampusEditsForTests, useCampusEdits } from "@/game/build/store";
import { useBuildMode } from "@/game/build/mode";
import { useCameraDirector } from "@/game/engine/camera/director";
import { getLiveYaw } from "@/game/engine/camera/live-camera";
import { resetProjectsForTests, useProjectsStore } from "@/stores/projects";
import { BIOMES } from "@/game/world/biome";
import type { ReactThreeTest } from "@react-three/test-renderer";

const HALF_PI = Math.PI / 2;

/**
 * The `<group>` CampusWorld wraps around each building's `<Pavilion>`/
 * `<Headquarters>`, identified by its `name` marker (same convention the
 * stubbed RoofPlate `<Text>` above uses) rather than position — every
 * wrapper carries an `onPointerDown` now (M6 T4: HQ's click opens its own
 * card, same gesture as a plot pavilion opening RoomCard), so a
 * prop-presence check would find it on every wrapper regardless of kind.
 */
function pavilionWrapper(
  scene: ReactThreeTest.ReactThreeTestInstance,
  plotIndex: number,
): ReactThreeTest.ReactThreeTestInstance {
  const matches = scene.findAll((node) => node.props.name === `pavilion-wrapper-${plotIndex}`);
  expect(matches).toHaveLength(1);
  return matches[0]!;
}

describe("CampusWorld smoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCampusEditsForTests();
    resetProjectsForTests();
    useCameraDirector.setState({ mode: { kind: "free" } });
    vi.mocked(getLiveYaw).mockReturnValue(0);
  });

  it("mounts terrain and one mesh per decor/prop placement into a scene graph", async () => {
    const renderer = await ReactThreeTestRenderer.create(<CampusWorld />);
    const scene = renderer.scene;
    const meshes = scene.findAllByType("Mesh");
    const layout = campusLayout();
    const totalPlacements =
      layout.pathTiles.length +
      Object.values(layout.scatter).reduce((n, arr) => n + arr.length, 0) +
      Object.values(layout.props).reduce((n, arr) => n + arr.length, 0);
    // 5 terrain meshes (apron + grass + 2 path strips + plaza plate) + one
    // stamped mesh per placement (see Merged stub above) + CloudPuffs (7
    // puffs * 3 spheres) + Pavilions (M1 T1, walls M5 T3): each of the 4
    // project pavilions = 1 slab + 4 pillars + 3 beams + walls (3 full sides
    // + 2 segments on the door-side wall) + 4 desks × (1 top + 2 legs + 1
    // screen) = 29 meshes; 4 pavilions = 116.
    // M6: campusBuildings() prepends the permanent HQ building, which
    // CampusWorld now renders through Headquarters.tsx (not Pavilion) — see
    // headquarters.smoke.test.tsx for that component's own formula: apron +
    // slab (2) + 4 pillars (beam ring cut on user feedback) + walls (4
    // sides x 2 segments, since every side carries its own door) + steps
    // (4 doors x 2 flanking meshes) + podium (1) + 2 banners (1
    // mocked-model mesh each) = 25, plus its own permanent plate (1 backdrop
    // mesh, HeadquartersPlate — mounted outside the frozen group, since its
    // Billboard must keep facing the camera every frame) and its wall-
    // anchored function props (HqProps.tsx, M9 polish — mounted INSIDE the
    // frozen group, unlike the plate, since none of these use Billboard):
    // a notice board (2 posts + 1 backboard + 5 papers + 5 pin dots + 1
    // hitbox = 14), a reception desk (slab + front panel + bell (2) + sign
    // (2) + 1 hitbox = 7), and a workbench (top + 4 legs + hammer (2) +
    // wrench (2) + paint can + 1 hitbox = 11) = 32 total.
    // The fixed plaza-center Fountain is gone (M6 moved it to placed decor,
    // where it renders zero meshes with the default EMPTY_EDITS state — see
    // the placed-fountain test further down).
    const TERRAIN_MESHES = 5;
    const CLOUD_MESHES = 7 * 3;
    const HQ_MESHES = 25;
    const HQ_PLATE_MESHES = 1;
    const HQ_PROPS_MESHES = 32;
    const PAVILION_MESHES = 4 * 26; // beams cut on user feedback (was 29)
    expect(meshes.length).toBe(
      totalPlacements +
        TERRAIN_MESHES +
        CLOUD_MESHES +
        PAVILION_MESHES +
        HQ_MESHES +
        HQ_PLATE_MESHES +
        HQ_PROPS_MESHES,
    );
    await renderer.unmount();
  });

  it("HQ is clickable too (M6 T4) — it opens the hq card, not a RoomCard", async () => {
    useBuildMode.setState({ roomCard: null });
    const renderer = await ReactThreeTestRenderer.create(<CampusWorld />);

    const hq = pavilionWrapper(renderer.scene, -1);
    expect(typeof hq.props.onPointerDown).toBe("function");
    await renderer.fireEvent(hq, "pointerDown", { button: 0 });
    expect(useBuildMode.getState().roomCard).toEqual({ kind: "hq" });

    const plot0 = pavilionWrapper(renderer.scene, 0);
    expect(typeof plot0.props.onPointerDown).toBe("function");
    await renderer.fireEvent(plot0, "pointerDown", { button: 0 });
    expect(useBuildMode.getState().roomCard).toEqual({ kind: "plot", plotIndex: 0 });

    await renderer.unmount();
  });

  it("HQ click is inert in build mode, same guard as plot pavilions", async () => {
    useBuildMode.setState({ roomCard: null, active: true });
    const renderer = await ReactThreeTestRenderer.create(<CampusWorld />);

    const hq = pavilionWrapper(renderer.scene, -1);
    await renderer.fireEvent(hq, "pointerDown", { button: 0 });
    expect(useBuildMode.getState().roomCard).toBeNull();
    expect(useCameraDirector.getState().mode).toEqual({ kind: "free" });

    useBuildMode.setState({ active: false });
    await renderer.unmount();
  });

  // M8 T3: the same pavilion click that opens RoomCard/HqCard also frames
  // the building with the camera director.
  it("HQ click also focuses the camera director, centered on HQ's rect", async () => {
    useBuildMode.setState({ roomCard: null });
    const renderer = await ReactThreeTestRenderer.create(<CampusWorld />);

    const hq = pavilionWrapper(renderer.scene, -1);
    await renderer.fireEvent(hq, "pointerDown", { button: 0 });

    const mode = useCameraDirector.getState().mode;
    expect(mode.kind).toBe("focus");
    expect(mode.kind === "focus" && mode.target).toEqual({ x: 0, z: 0 });

    await renderer.unmount();
  });

  it("a plot pavilion click also focuses the camera director, centered on its rect", async () => {
    useBuildMode.setState({ roomCard: null });
    const renderer = await ReactThreeTestRenderer.create(<CampusWorld />);
    const layout = campusLayout();

    const plot0 = pavilionWrapper(renderer.scene, 0);
    await renderer.fireEvent(plot0, "pointerDown", { button: 0 });

    const mode = useCameraDirector.getState().mode;
    expect(mode.kind).toBe("focus");
    expect(mode.kind === "focus" && mode.target).toEqual({ x: layout.plots[0]!.x, z: layout.plots[0]!.z });

    await renderer.unmount();
  });

  // M8 T3: proves the click handler threads the rig's LIVE yaw through to
  // focusBuilding (rather than always seeding 0) — HQ's 4-door pick is the
  // only building where currentYaw changes the outcome (director.test.ts
  // covers focusForBuilding's own door-selection math in full; this only
  // needs to prove the wiring reaches it).
  it("threads the rig's live yaw into focusBuilding — HQ picks the door nearest it", async () => {
    vi.mocked(getLiveYaw).mockReturnValue(HALF_PI - 0.1);
    useBuildMode.setState({ roomCard: null });

    const renderer = await ReactThreeTestRenderer.create(<CampusWorld />);
    const hq = pavilionWrapper(renderer.scene, -1);
    await renderer.fireEvent(hq, "pointerDown", { button: 0 });

    const mode = useCameraDirector.getState().mode;
    expect(mode.kind).toBe("focus");
    // currentYaw near the east door (π/2) — with the stock currentYaw of 0
    // used by every other test in this file, this would pick the south
    // door (yaw 0) instead, so landing on π/2 proves the mocked getter's
    // value made it all the way to focusForBuilding.
    expect(mode.kind === "focus" && mode.yaw).toBeCloseTo(HALF_PI, 10);

    await renderer.unmount();
  });

  it("HQ's 📋/👥 prop stands (M6 T4) route clicks to the projects/hire cards", async () => {
    useBuildMode.setState({ roomCard: null });
    const renderer = await ReactThreeTestRenderer.create(<CampusWorld />);

    const projectsProp = renderer.scene.findAll((n) => n.props.name === "hq-prop-projects")[0]!;
    await renderer.fireEvent(projectsProp, "pointerDown", { button: 0 });
    expect(useBuildMode.getState().roomCard).toEqual({ kind: "projects" });

    const hireProp = renderer.scene.findAll((n) => n.props.name === "hq-prop-hire")[0]!;
    await renderer.fireEvent(hireProp, "pointerDown", { button: 0 });
    expect(useBuildMode.getState().roomCard).toEqual({ kind: "hire" });

    await renderer.unmount();
  });

  it("HQ's 🧰 prop stand opens the workspace window instead of touching the card slot", async () => {
    useBuildMode.setState({ roomCard: null });
    const renderer = await ReactThreeTestRenderer.create(<CampusWorld />);

    const workspaceProp = renderer.scene.findAll((n) => n.props.name === "hq-prop-workspace")[0]!;
    await renderer.fireEvent(workspaceProp, "pointerDown", { button: 0 });
    expect(useBuildMode.getState().roomCard).toBeNull();
    expect(openWorkspaceWindow).toHaveBeenCalledTimes(1);

    await renderer.unmount();
  });

  it("HQ's prop stands are inert in build mode, same guard as the HQ/pavilion clicks", async () => {
    useBuildMode.setState({ roomCard: null, active: true });
    const renderer = await ReactThreeTestRenderer.create(<CampusWorld />);

    const projectsProp = renderer.scene.findAll((n) => n.props.name === "hq-prop-projects")[0]!;
    await renderer.fireEvent(projectsProp, "pointerDown", { button: 0 });
    expect(useBuildMode.getState().roomCard).toBeNull();

    useBuildMode.setState({ active: false });
    await renderer.unmount();
  });

  it("adds exactly one mesh per placed item on top of the base scene", async () => {
    const before = await ReactThreeTestRenderer.create(<CampusWorld />);
    const baseCount = before.scene.findAllByType("Mesh").length;
    await before.unmount();

    useCampusEdits.getState().addItem("bush", 10, 10, 0);
    useCampusEdits.getState().addItem("lantern", -10, -10, 0);

    const after = await ReactThreeTestRenderer.create(<CampusWorld />);
    expect(after.scene.findAllByType("Mesh").length).toBe(baseCount + 2);
    await after.unmount();
  });

  it("renders a placed fountain as its own animated <Fountain> (2 meshes: model + water disc), not instanced through InstancedModel (1 mesh per placement like every other kind)", async () => {
    const before = await ReactThreeTestRenderer.create(<CampusWorld />);
    const baseCount = before.scene.findAllByType("Mesh").length;
    await before.unmount();

    useCampusEdits.getState().addItem("fountain", 10, 10, 0);
    useCampusEdits.getState().addItem("bench", -10, -10, 0);

    const after = await ReactThreeTestRenderer.create(<CampusWorld />);
    // +2 for the fountain (model + water disc, Fountain's own signature —
    // see Fountain.tsx) and +1 for the bench (InstancedModel, one stamped
    // mesh per placement) confirms the fountain took the different path.
    expect(after.scene.findAllByType("Mesh").length).toBe(baseCount + 3);
    await after.unmount();
  });

  it.each(["desert", "island", "sky"] as const)(
    "mounts the %s biome without a campus regression",
    async (id) => {
      const renderer = await ReactThreeTestRenderer.create(<CampusWorld biome={BIOMES[id]} />);
      // Not an exact count (skip lists change the total) — just proves the
      // biome mounts a real, non-trivial scene through the same code path.
      expect(renderer.scene.findAllByType("Mesh").length).toBeGreaterThan(100);
      await renderer.unmount();
    },
  );

  it("adds one roof-plate mesh (the color dot) per base pavilion linked to a project, none when unlinked", async () => {
    const before = await ReactThreeTestRenderer.create(<CampusWorld />);
    const baseCount = before.scene.findAllByType("Mesh").length;
    await before.unmount();

    // The stubbed Text above renders a `group`, not a `mesh` — only the
    // color-dot mesh shows up in this count.
    useProjectsStore.setState({
      projects: [
        {
          id: "proj-1",
          name: "Acme",
          description: null,
          icon: "🚀",
          color: "#22c55e",
          folder_path: "/work/acme",
          docs_path: null,
          status: "active",
          created_at: 0,
          updated_at: 0,
        },
      ],
    });
    useCampusEdits.getState().setPlotProject(0, "proj-1");

    const after = await ReactThreeTestRenderer.create(<CampusWorld />);
    expect(after.scene.findAllByType("Mesh").length).toBe(baseCount + 1);
    await after.unmount();
  });

  it("never renders a roof plate for HQ, even if plotProjects somehow carries its plotIndex (-1) (M6 fast-follow)", async () => {
    const before = await ReactThreeTestRenderer.create(<CampusWorld />);
    const baseCount = before.scene.findAllByType("Mesh").length;
    await before.unmount();

    useProjectsStore.setState({
      projects: [
        {
          id: "proj-1",
          name: "Acme",
          description: null,
          icon: "🚀",
          color: "#22c55e",
          folder_path: "/work/acme",
          docs_path: null,
          status: "active",
          created_at: 0,
          updated_at: 0,
        },
      ],
    });
    // HQ's plotIndex is -1 — not a real plot, but plotProjects is just a
    // Record<number, string>, so nothing stops a stray -1 entry from
    // existing. CampusWorld's RoofPlate mapping filters HQ out entirely, so
    // this must add zero meshes (not the +1 a linked plot would add).
    useCampusEdits.getState().setPlotProject(-1, "proj-1");

    const after = await ReactThreeTestRenderer.create(<CampusWorld />);
    expect(after.scene.findAllByType("Mesh").length).toBe(baseCount);
    await after.unmount();
  });

  // Fix round 1 (review finding): the tests above only prove mount-time
  // correctness (link the project, *then* mount) — they can't catch a
  // RoofPlate that only reads its project at mount and never reacts to a
  // link made after the fact. This mounts once, asserts no plate, links the
  // plot live, and asserts the plate's label actually appears — same
  // mutate-while-mounted + act()/advanceFrames() pattern as
  // use-sim.test.tsx. Only covers the base-pavilion path (CampusWorld); the
  // placed-building path (PlacedBuildings.tsx) mounts the exact same
  // RoofPlate component off the exact same useProjectsStore subscription,
  // just fed `edits.buildings[].projectId` instead of `edits.plotProjects`,
  // so this same reactivity is already exercised — not duplicated there.
  it("shows a base pavilion's roof plate live once its plot is linked mid-mount, not just at mount time", async () => {
    useProjectsStore.setState({
      projects: [
        {
          id: "proj-1",
          name: "Acme",
          description: null,
          icon: "🚀",
          color: "#22c55e",
          folder_path: "/work/acme",
          docs_path: null,
          status: "active",
          created_at: 0,
          updated_at: 0,
        },
      ],
    });

    const renderer = await ReactThreeTestRenderer.create(<CampusWorld />);
    const plateLabel = () => renderer.scene.findAll((n) => n.props.name === "plate:🚀 Acme");

    expect(plateLabel()).toHaveLength(0);

    await ReactThreeTestRenderer.act(async () => {
      useCampusEdits.getState().setPlotProject(0, "proj-1");
      await renderer.advanceFrames(1, 0.1);
    });

    expect(plateLabel()).toHaveLength(1);

    await renderer.unmount();
  });
});

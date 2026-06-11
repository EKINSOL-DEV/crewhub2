// R3F render smoke (EKI-77): @react-three/test-renderer builds the three.js
// scene graph without a real WebGL context, so this runs under jsdom.
//
// drei's <Text> (troika) suspends forever in jsdom — no font pipeline — and
// <Html> needs a live canvas parent, so both are stubbed. Geometry, materials,
// instancing and the bot hierarchy are the real thing.
import { describe, expect, it, vi } from "vitest";
import ReactThreeTestRenderer from "@react-three/test-renderer";

vi.mock("@react-three/drei", async (importOriginal) => {
  const real = await importOriginal<typeof import("@react-three/drei")>();
  return {
    ...real,
    Text: () => null,
    Html: () => null,
    Billboard: ({ children }: { children?: React.ReactNode }) => <group>{children}</group>,
  };
});
import type { Room } from "@/ipc/bindings";
import type { WorldBot } from "./lib/bots";
import { layoutWorld } from "./lib/layout";
import { WorldScene } from "./WorldScene";

const room: Room = {
  id: "r1",
  project_id: null,
  name: "Den",
  icon: null,
  color: "#445566",
  sort_order: 0,
  is_hq: false,
  style_json: null,
  created_at: 0,
  updated_at: 0,
};

function bot(key: string, over: Partial<WorldBot> = {}): WorldBot {
  return {
    key,
    id: { provider: "claude", id: key },
    name: key,
    status: "Working",
    activity: "Editing main.rs",
    color: "#7dd3fc",
    roomId: "r1",
    parentKey: null,
    isSubagent: false,
    ...over,
  };
}

describe("WorldScene smoke", () => {
  it("mounts rooms and bots into a three.js scene graph", async () => {
    const world = layoutWorld([room]);
    const renderer = await ReactThreeTestRenderer.create(
      <WorldScene
        world={world}
        bots={[bot("a"), bot("b", { parentKey: "a", isSubagent: true, status: "Idle" })]}
        reducedMotion={true}
      />,
    );
    // ground + capsule bodies + eyes/smiles/antennae + glow rings…
    const meshes = renderer.scene.findAllByType("Mesh");
    expect(meshes.length).toBeGreaterThan(10);
    // …and the bot capsules carry their soft colors.
    const capsules = meshes.filter(
      (m) => (m.instance as unknown as { geometry: { type: string } }).geometry?.type === "CapsuleGeometry",
    );
    expect(capsules).toHaveLength(2);
    await renderer.unmount();
  });
});

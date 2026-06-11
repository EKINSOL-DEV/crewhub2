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
import type { Room, Task } from "@/ipc/bindings";
import type { WorldBot } from "./lib/bots";
import { layoutWorld } from "./lib/layout";
import { summarizeWall, wallScopeFor } from "./lib/taskwall";
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

  it("mounts a clickable task wall per room and routes its click (EKI-75)", async () => {
    const world = layoutWorld([room]);
    const zone = world.rooms.find((z) => z.id === "r1")!;
    const tasks: Task[] = [
      {
        id: "t1",
        project_id: "p1",
        room_id: "r1",
        title: "Paint the shed",
        description: null,
        status: "todo",
        priority: "high",
        assignee_agent_id: null,
        created_by: "human",
        created_at: 1,
        updated_at: 1,
      },
    ];
    const walls = new Map([[zone.id, summarizeWall(tasks, wallScopeFor(zone))]]);
    const onWallClick = vi.fn();

    const renderer = await ReactThreeTestRenderer.create(
      <WorldScene world={world} bots={[]} reducedMotion={true} walls={walls} onWallClick={onWallClick} />,
    );
    const meshes = renderer.scene.findAllByType("Mesh");
    // The wall contributes plane geometry: 2 per column (fill + header bar).
    const planes = meshes.filter(
      (m) => (m.instance as unknown as { geometry: { type: string } }).geometry?.type === "PlaneGeometry",
    );
    expect(planes.length).toBeGreaterThanOrEqual(10);

    // Clicking the backboard fires the wall handler with the zone.
    const backboard = meshes.find(
      (m) =>
        (m.instance as unknown as { geometry: { type: string; parameters: { depth: number } } }).geometry
          ?.type === "BoxGeometry" &&
        (m.instance as unknown as { geometry: { parameters: { depth: number } } }).geometry.parameters
          .depth === 0.06,
    )!;
    expect(backboard).toBeDefined();
    await renderer.fireEvent(backboard, "click", { stopPropagation: () => {} });
    expect(onWallClick).toHaveBeenCalledTimes(1);
    expect(onWallClick.mock.calls[0]![0]).toMatchObject({ id: "r1" });
    await renderer.unmount();
  });
});

// R3F render smoke for props (EKI-81): every core prop mounts into a real
// three.js scene graph (no WebGL needed), and unknown ids fall back to the
// crate. drei's <Text> (troika) suspends in jsdom — stubbed like elsewhere.
import { describe, expect, it, vi } from "vitest";
import ReactThreeTestRenderer from "@react-three/test-renderer";

vi.mock("@react-three/drei", async (importOriginal) => {
  const real = await importOriginal<typeof import("@react-three/drei")>();
  return { ...real, Text: () => null, Html: () => null };
});

import { LOBBY_ID, type WorldZone } from "../lib/layout";
import { WORLD_PALETTE_FALLBACK } from "../lib/theme-palette";
import type { PlacedProp } from "./placement";
import { Prop3D } from "./Prop3D";
import { propColors, PROP_LIST } from "./registry";
import { RoomProps3D } from "./RoomProps3D";

const colors = propColors(WORLD_PALETTE_FALLBACK);

function placed(propId: string, over: Partial<PlacedProp> = {}): PlacedProp {
  return { id: `i-${propId}`, propId, x: 0, z: 0, rot: 0, scale: 1, ...over };
}

describe("Prop3D smoke", () => {
  it("mounts every core prop with one mesh per part", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <group>
        {PROP_LIST.map((def) => (
          <Prop3D key={def.id} placed={placed(def.id)} position={[0, 0, 0]} colors={colors} />
        ))}
      </group>,
    );
    const meshes = renderer.scene.findAllByType("Mesh");
    const partCount = PROP_LIST.reduce((n, d) => n + d.parts.length, 0);
    expect(meshes.length).toBe(partCount);
  });

  it("renders unknown prop ids as the fallback crate", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <Prop3D placed={placed("mod:gold-throne")} position={[1, 0, 2]} colors={colors} />,
    );
    expect(renderer.scene.findAllByType("Mesh").length).toBeGreaterThan(0);
  });

  it("renders room props at zone offsets and keeps the lobby bare", async () => {
    const zone = (id: string, center: [number, number]): WorldZone => ({
      id,
      name: id,
      color: null,
      isHq: false,
      center,
      size: 10,
      width: 10,
    });
    const renderer = await ReactThreeTestRenderer.create(
      <RoomProps3D
        zones={[zone("r1", [5, 0]), zone(LOBBY_ID, [0, 12])]}
        byRoom={{ r1: [placed("core:plant", { x: 1, z: -2 })], [LOBBY_ID]: [placed("core:lamp")] }}
        palette={WORLD_PALETTE_FALLBACK}
      />,
    );
    const meshes = renderer.scene.findAllByType("Mesh");
    const plantParts = PROP_LIST.find((d) => d.id === "core:plant")!.parts.length;
    expect(meshes.length).toBe(plantParts); // lobby lamp not rendered
  });

  it("shows a selection ring only when selected", async () => {
    const sel = await ReactThreeTestRenderer.create(
      <Prop3D placed={placed("core:plant")} position={[0, 0, 0]} colors={colors} selected />,
    );
    const unsel = await ReactThreeTestRenderer.create(
      <Prop3D placed={placed("core:plant")} position={[0, 0, 0]} colors={colors} />,
    );
    expect(sel.scene.findAllByType("Mesh").length).toBe(unsel.scene.findAllByType("Mesh").length + 1);
  });
});

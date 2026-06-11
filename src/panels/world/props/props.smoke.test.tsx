// R3F render smoke for props (EKI-81): every core prop mounts into a real
// three.js scene graph (no WebGL needed), and unknown ids fall back to the
// crate. drei's <Text> (troika) suspends in jsdom — stubbed like elsewhere.
import { describe, expect, it, vi } from "vitest";
import ReactThreeTestRenderer from "@react-three/test-renderer";

vi.mock("@react-three/drei", async (importOriginal) => {
  const real = await importOriginal<typeof import("@react-three/drei")>();
  return { ...real, Text: () => null, Html: () => null };
});

import { WORLD_PALETTE_FALLBACK } from "../lib/theme-palette";
import type { PlacedProp } from "./placement";
import { Prop3D } from "./Prop3D";
import { propColors, PROP_LIST } from "./registry";

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

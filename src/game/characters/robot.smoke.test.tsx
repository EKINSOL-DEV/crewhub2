import { describe, expect, it } from "vitest";
import { createRef } from "react";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import type { RobotHandles } from "./Robot";
import { Robot } from "./Robot";

describe("Robot smoke", () => {
  it("mounts the boxy mascot and exposes animation handles", async () => {
    const handles = createRef<RobotHandles | null>() as React.MutableRefObject<RobotHandles | null>;
    const renderer = await ReactThreeTestRenderer.create(
      <Robot color="#7dd3fc" bulbColor="#22c55e" handles={handles} />,
    );
    const meshes = renderer.scene.findAllByType("Mesh");
    expect(meshes.length).toBeGreaterThanOrEqual(14); // feet+body+band+arms+head+eyes+pupils+blush+smile+antenna+bulb
    expect(handles.current).not.toBeNull();
    expect(handles.current!.armR).toBeDefined();
    expect(handles.current!.bulb).toBeDefined();
    await renderer.unmount();
  });
});

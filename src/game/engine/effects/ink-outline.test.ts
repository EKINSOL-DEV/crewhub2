import { describe, expect, it } from "vitest";
import { InkOutlineEffect } from "./ink-outline";

describe("InkOutlineEffect", () => {
  it("constructs with tunable uniforms", () => {
    const fx = new InkOutlineEffect();
    expect(fx.name).toBe("InkOutlineEffect");
    for (const u of ["outlineColor", "depthBias", "depthMul", "colorMul"]) {
      expect(fx.uniforms.get(u)).toBeDefined();
    }
  });

  it("accepts overrides", () => {
    const fx = new InkOutlineEffect({ depthMul: 2 });
    expect(fx.uniforms.get("depthMul")!.value).toBe(2);
  });
});

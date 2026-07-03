import { describe, expect, it } from "vitest";
import type { GameEnvironment } from "@/game/world/environments/types";
import { dayRig, nightRig, nightSky } from "./night";

const env: GameEnvironment = {
  id: "campus",
  name: "Campus",
  emoji: "🏫",
  sky: "#aee2f7",
  fog: { color: "#c9ecf9", near: 60, far: 160 },
  ambient: { color: "#ffffff", intensity: 0.55 },
  hemisphere: { sky: "#bfe6ff", ground: "#9ed98a", intensity: 0.5 },
  sun: { position: [30, 44, 34], color: "#fff3d6", intensity: 2.6 },
  World: () => null,
};

describe("dayRig", () => {
  it("extracts the environment's own rig unchanged", () => {
    expect(dayRig(env)).toEqual({ ambient: env.ambient, hemisphere: env.hemisphere, sun: env.sun });
  });
});

describe("nightRig", () => {
  it("dims ambient below the day level, keeping a positive intensity", () => {
    const rig = nightRig(env);
    expect(rig.ambient.intensity).toBeGreaterThan(0);
    expect(rig.ambient.intensity).toBeLessThan(env.ambient.intensity);
    expect(rig.ambient.color).toBe("#b9c6e8");
  });

  it("swaps the hemisphere for a moonlit blue, dimmer than day", () => {
    const rig = nightRig(env);
    expect(rig.hemisphere).toEqual({ sky: "#4a5a86", ground: "#2f3a55", intensity: 0.35 });
    expect(rig.hemisphere.intensity).toBeLessThan(env.hemisphere.intensity);
  });

  it("turns the sun into a dim moon mirrored across the sky, keeping height", () => {
    const rig = nightRig(env);
    expect(rig.sun.color).toBe("#9db8ff");
    expect(rig.sun.intensity).toBeGreaterThan(0);
    expect(rig.sun.intensity).toBeLessThan(env.sun.intensity);
    const [x, y, z] = env.sun.position;
    expect(rig.sun.position).toEqual([-x, y, -z]);
  });

  it("is a pure, deterministic derivation", () => {
    expect(nightRig(env)).toEqual(nightRig(env));
  });
});

describe("nightSky", () => {
  it("returns a fixed deep-blue sky and fog, same for every environment", () => {
    expect(nightSky(env)).toEqual({ sky: "#182338", fog: "#1f2c47" });
    expect(nightSky({ ...env, id: "desert" })).toEqual({ sky: "#182338", fog: "#1f2c47" });
  });
});

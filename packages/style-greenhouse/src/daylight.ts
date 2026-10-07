/* The day-night drift: the lighting presets of style.json as lights that mix, and the stops of one day per theme. The
   theme sets the base and the drift shades it. By day the town runs from the morning through the afternoon into a warm
   dusk and a gentle evening (its lanterns and windows lit, the daylight walls kept), and back through a pink dawn. In
   lamplight the evening deepens into a cool night under a high moon and warms up again. Pure: no scene, no clock. */
import * as THREE from "three";
import type { DriftLight, LightingPreset, StyleTheme } from "@crewhub/world-style";

/** A lighting preset with parsed colours and vectors, so mixing allocates nothing. */
export interface Light {
  sky: THREE.Color;
  ground: THREE.Color;
  hemisphere: number;
  key: THREE.Color;
  keyIntensity: number;
  keyPosition: THREE.Vector3;
  fill: THREE.Color;
  fillIntensity: number;
  fillPosition: THREE.Vector3;
  exposure: number;
  shadowOpacity: number;
  glow: number;
  pools: number;
  evening: number;
  air: THREE.Color;
  airTint: number;
}

/** The lights a day mixes: the themes, the style's drift lights and the gentle evening of the day theme. */
type LightName = StyleTheme | DriftLight | "day-evening" | "lamplight-dusk" | "lamplight-dawn";
export type Lights = Partial<Record<LightName, Light>> & Record<StyleTheme, Light>;

/** One day per theme as stops `[phase, light]`; between two stops the light eases from one to the next. */
export const DAY_STOPS: Record<StyleTheme, readonly (readonly [number, LightName])[]> = {
  day: [
    [0, "day"],
    [0.5, "day"],
    [0.62, "dusk"],
    [0.72, "day-evening"],
    [0.82, "day-evening"],
    [0.92, "dawn"],
    [1, "day"],
  ],
  lamplight: [
    [0, "lamplight"],
    [0.5, "lamplight"],
    [0.6, "lamplight-dusk"],
    [0.7, "night"],
    [0.84, "night"],
    [0.93, "lamplight-dawn"],
    [1, "lamplight"],
  ],
};

/** How far the day theme's evening leans from the dusk towards the night: lit, but still a daylight town. */
const DAY_EVENING_DEPTH = 0.35;
/** In lamplight the dusk and the dawn show only in the air, faintly: a rose and a warm glow behind the evening town. */
const LAMPLIGHT_AIR = 0.12;

export function toLight(preset: LightingPreset): Light {
  return {
    sky: new THREE.Color(preset.sky),
    ground: new THREE.Color(preset.ground),
    hemisphere: preset.hemisphere,
    key: new THREE.Color(preset.key),
    keyIntensity: preset.keyIntensity,
    keyPosition: new THREE.Vector3(...preset.keyPosition),
    fill: new THREE.Color(preset.fill),
    fillIntensity: preset.fillIntensity,
    fillPosition: new THREE.Vector3(...preset.fillPosition),
    exposure: preset.exposure,
    shadowOpacity: preset.shadowOpacity,
    glow: preset.glow,
    pools: preset.pools,
    evening: preset.evening,
    air: new THREE.Color(preset.air),
    airTint: preset.airTint,
  };
}

/** A copy of `light`, to mix into. */
export function cloneLight(light: Light): Light {
  return mixLights(light, light, 0, {
    ...light,
    sky: new THREE.Color(),
    ground: new THREE.Color(),
    key: new THREE.Color(),
    keyPosition: new THREE.Vector3(),
    fill: new THREE.Color(),
    fillPosition: new THREE.Vector3(),
    air: new THREE.Color(),
  });
}

/** `a` eased `t` of the way to `b`, written into `out` (which may be `a` or `b`). */
export function mixLights(a: Light, b: Light, t: number, out: Light): Light {
  const n = (x: number, y: number) => x + (y - x) * t;
  out.sky.copy(a.sky).lerp(b.sky, t);
  out.ground.copy(a.ground).lerp(b.ground, t);
  out.key.copy(a.key).lerp(b.key, t);
  out.fill.copy(a.fill).lerp(b.fill, t);
  out.air.copy(a.air).lerp(b.air, t);
  out.keyPosition.copy(a.keyPosition).lerp(b.keyPosition, t);
  out.fillPosition.copy(a.fillPosition).lerp(b.fillPosition, t);
  out.hemisphere = n(a.hemisphere, b.hemisphere);
  out.keyIntensity = n(a.keyIntensity, b.keyIntensity);
  out.fillIntensity = n(a.fillIntensity, b.fillIntensity);
  out.exposure = n(a.exposure, b.exposure);
  out.shadowOpacity = n(a.shadowOpacity, b.shadowOpacity);
  out.glow = n(a.glow, b.glow);
  out.pools = n(a.pools, b.pools);
  out.evening = n(a.evening, b.evening);
  out.airTint = n(a.airTint, b.airTint);
  return out;
}

/** Whether two lights look the same: what the drift skips instead of re-lighting the scene. */
export function sameLight(a: Light, b: Light): boolean {
  const near = (x: number, y: number) => Math.abs(x - y) < 1e-4;
  const same = (x: THREE.Color, y: THREE.Color) => near(x.r, y.r) && near(x.g, y.g) && near(x.b, y.b);
  return (
    near(a.hemisphere, b.hemisphere) &&
    near(a.keyIntensity, b.keyIntensity) &&
    near(a.fillIntensity, b.fillIntensity) &&
    near(a.exposure, b.exposure) &&
    near(a.shadowOpacity, b.shadowOpacity) &&
    near(a.glow, b.glow) &&
    near(a.pools, b.pools) &&
    near(a.evening, b.evening) &&
    near(a.airTint, b.airTint) &&
    same(a.air, b.air) &&
    same(a.sky, b.sky) &&
    same(a.ground, b.ground) &&
    same(a.key, b.key) &&
    same(a.fill, b.fill) &&
    a.keyPosition.distanceToSquared(b.keyPosition) < 1e-6 &&
    a.fillPosition.distanceToSquared(b.fillPosition) < 1e-6
  );
}

/** The lights of a style's presets; without dawn, dusk and night the style has no drift (`drifts`). */
export function compileLights(presets: Record<StyleTheme, LightingPreset> & Partial<Record<DriftLight, LightingPreset>>): Lights {
  const lights: Lights = { day: toLight(presets.day), lamplight: toLight(presets.lamplight) };
  for (const name of ["dawn", "dusk", "night"] as const) {
    const preset = presets[name];
    if (preset) lights[name] = toLight(preset);
  }
  if (lights.dusk && lights.night) {
    const evening = mixLights(lights.dusk, lights.night, DAY_EVENING_DEPTH, cloneLight(lights.dusk));
    // The air goes further than the light: the rosy dusk gives way to a blue-green evening behind a still-lit town.
    evening.air.copy(lights.night.air);
    evening.airTint = lights.night.airTint;
    lights["day-evening"] = evening;
  }
  for (const [name, from] of [["lamplight-dusk", lights.dusk], ["lamplight-dawn", lights.dawn]] as const) {
    if (!from) continue;
    const light = cloneLight(lights.lamplight);
    light.air.copy(from.air);
    light.airTint = LAMPLIGHT_AIR;
    lights[name] = light;
  }
  return lights;
}

/** Whether every light of the theme's day is there. */
export function drifts(lights: Lights, theme: StyleTheme): boolean {
  return DAY_STOPS[theme].every(([, name]) => lights[name] !== undefined);
}

/** The time of day as a fraction of one day, wrapped into [0, 1). */
export function wrapPhase(phase: number): number {
  const u = phase - Math.floor(phase);
  return u >= 1 ? 0 : u;
}

/**
 * The light of `theme` at `phase` (a fraction of one day, wrapped), written into `out`. A style without the drift
 * lights gives the theme's own light at every phase.
 */
export function driftLight(lights: Lights, theme: StyleTheme, phase: number, out: Light): Light {
  if (!drifts(lights, theme)) return mixLights(lights[theme], lights[theme], 0, out);
  const stops = DAY_STOPS[theme];
  const u = wrapPhase(phase);
  let i = 0;
  while (i < stops.length - 2 && u >= stops[i + 1]![0]) i++;
  const [from, a] = stops[i]!,
    [to, b] = stops[i + 1]!;
  const t = to > from ? THREE.MathUtils.smoothstep(u, from, to) : 0;
  return mixLights(lights[a]!, lights[b]!, t, out);
}

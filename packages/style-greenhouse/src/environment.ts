/* The Greenhouse light rig per theme, from the lighting presets in style.json: the old room's soft key light, a
   hemisphere fill and a cool fill light, ACES tone mapping. The key light's shadow follows what the camera frames: a
   close, crisp shadow map over an entered building or room, a cheaper, softer one over the whole town. The day-night
   drift shades the theme's light through the day (./daylight.ts); the sun moves its shadow only by a visible step. */
import * as THREE from "three";
import type { EnvironmentHandle, GraphicsQuality, LightingPreset, StyleManifest, StyleTheme } from "@crewhub/world-style";
import { cloneLight, compileLights, driftLight, mixLights, sameLight, type Light } from "./daylight.ts";
import { CLOUDS, setClouds } from "./shaders.ts";

/** Shadow map texels per side for a reach: an entered building (reach ≲ 16) gets the sharp map. */
// The close map covers what an entered building's view shows (reach up to about 24); the town's is wider and softer.
const shadowSize = (reach: number) => (reach <= 24 ? 2048 : 1024);

/** The sun turns its shadow only once its direction moved this far (radians, about 0.5°): steps too small to see. */
const SUN_STEP = 0.009;

export function environment(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  presets: StyleManifest["lighting"],
  theme: StyleTheme,
  onTheme: (theme: StyleTheme) => void,
  onQuality: (quality: GraphicsQuality) => void,
  onLight: (light: Light) => void,
): EnvironmentHandle {
  const hemisphere = new THREE.HemisphereLight();
  const sun = new THREE.DirectionalLight();
  sun.castShadow = true;
  sun.shadow.normalBias = 0.035;
  sun.shadow.bias = -0.0001;
  const fill = new THREE.DirectionalLight();
  scene.add(hemisphere, sun, sun.target, fill);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const lights = compileLights(presets);
  /** The light shown now, the next one being mixed, and the sun direction its shadow was last drawn for. */
  const light = cloneLight(lights[theme]);
  const next = cloneLight(lights[theme]);
  const sunDirection = new THREE.Vector3();
  const step = new THREE.Vector3();
  let base: LightingPreset = presets[theme];
  let current = theme;
  let phase: number | null = null;
  let focus = { reach: 12, x: 0, z: 0 };
  let quality: GraphicsQuality = "pretty";
  let shadowVersion = 0;

  /** The key light keeps the light's direction and sits far enough out to see the whole square. */
  const place = () => {
    sunDirection.copy(light.keyPosition).normalize();
    const distance = Math.max(light.keyPosition.length(), focus.reach * 2);
    // Cloud shadows fall along the key light.
    CLOUDS.slope.value.set(sunDirection.x / Math.max(0.01, sunDirection.y), sunDirection.z / Math.max(0.01, sunDirection.y));
    sun.target.position.set(focus.x, 0, focus.z);
    sun.position.set(focus.x, 0, focus.z).addScaledVector(sunDirection, distance);
    sun.target.updateMatrixWorld();
    fill.position.copy(light.fillPosition);
    const r = focus.reach;
    Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 0.5, far: distance + r * 2 + 10 });
    sun.shadow.camera.updateProjectionMatrix();
    // Softness in texels: the close map blurs a little more per texel so both read as the same soft daylight.
    const size = shadowSize(r);
    sun.shadow.radius = size === 2048 ? 2.5 : 2;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
    sun.shadow.needsUpdate = true;
    shadowVersion++;
  };

  /** Shows `light`: colours and strengths at once, the sun's position (and so its shadow) only by a visible step. */
  const show = (force: boolean) => {
    hemisphere.color.copy(light.sky);
    hemisphere.groundColor.copy(light.ground);
    hemisphere.intensity = light.hemisphere;
    sun.color.copy(light.key);
    sun.intensity = light.keyIntensity;
    fill.color.copy(light.fill);
    fill.intensity = light.fillIntensity;
    renderer.toneMappingExposure = light.exposure;
    if (force || step.copy(light.keyPosition).normalize().angleTo(sunDirection) > SUN_STEP) place();
    else fill.position.copy(light.fillPosition);
    onLight(light);
  };

  /** The light of the theme now: its own, or shaded by the time of day. False when nothing visibly changed. */
  const update = (force: boolean): boolean => {
    if (phase === null) mixLights(lights[current], lights[current], 0, next);
    else driftLight(lights, current, phase, next);
    if (!force && sameLight(next, light)) return false;
    mixLights(next, next, 0, light);
    show(force);
    return true;
  };

  const apply = (next: StyleTheme) => {
    current = next;
    base = presets[next];
    scene.background = base.background ? new THREE.Color(base.background) : null;
    // The swatches follow the theme first; the light (glow, pools, lanterns) then follows the time of day.
    onTheme(next);
    update(true);
  };
  apply(theme);
  return {
    setTheme: apply,
    setShadowReach(reach, center) {
      focus = { reach, x: center?.x ?? 0, z: center?.z ?? 0 };
      place();
    },
    setQuality(next) {
      quality = next;
      sun.castShadow = quality === "pretty";
      onQuality(quality);
    },
    setCloudShadows: setClouds,
    setDayPhase(at) {
      if (at === phase) return false;
      phase = at;
      return update(false);
    },
    get evening() {
      return light.evening;
    },
    get air() {
      return { color: light.air, tint: light.airTint };
    },
    get shadowVersion() {
      return shadowVersion;
    },
    dispose() {
      setClouds([]);
      scene.remove(hemisphere, sun, sun.target, fill);
      sun.shadow.dispose();
    },
  };
}

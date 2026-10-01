/* The Greenhouse light rig per theme, from the lighting presets in style.json: the old room's soft key light, a
   hemisphere fill and a cool fill light, ACES tone mapping. The key light's shadow follows what the camera frames: a
   close, crisp shadow map over an entered building or room, a cheaper, softer one over the whole town. */
import * as THREE from "three";
import type { EnvironmentHandle, GraphicsQuality, LightingPreset, StyleTheme } from "@crewhub/world-style";

/** Shadow map texels per side for a reach: an entered building (reach ≲ 16) gets the sharp map. */
const shadowSize = (reach: number) => (reach <= 16 ? 2048 : 1024);

export function environment(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  presets: Record<StyleTheme, LightingPreset>,
  theme: StyleTheme,
  onTheme: (theme: StyleTheme) => void,
  onQuality: (quality: GraphicsQuality) => void,
): EnvironmentHandle {
  const hemisphere = new THREE.HemisphereLight();
  const sun = new THREE.DirectionalLight();
  sun.castShadow = true;
  sun.shadow.normalBias = 0.035;
  sun.shadow.bias = -0.0001;
  const fill = new THREE.DirectionalLight();
  scene.add(hemisphere, sun, sun.target, fill);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  let preset = presets[theme];
  let focus = { reach: 12, x: 0, z: 0 };
  let quality: GraphicsQuality = "pretty";

  /** The key light keeps its preset direction and sits far enough out to see the whole square. */
  const place = () => {
    const direction = new THREE.Vector3(...preset.keyPosition);
    const distance = Math.max(direction.length(), focus.reach * 2);
    direction.setLength(distance);
    sun.target.position.set(focus.x, 0, focus.z);
    sun.position.set(focus.x, 0, focus.z).add(direction);
    sun.target.updateMatrixWorld();
    fill.position.set(...preset.fillPosition);
    const r = focus.reach;
    Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 0.5, far: distance + r * 2 + 10 });
    sun.shadow.camera.updateProjectionMatrix();
    // Softness in texels: the close map blurs a little more per texel so both read as the same soft daylight.
    const size = shadowSize(r);
    sun.shadow.radius = size === 2048 ? 4 : 2.5;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
    sun.shadow.needsUpdate = true;
  };

  const apply = (next: StyleTheme) => {
    preset = presets[next];
    hemisphere.color.set(preset.sky);
    hemisphere.groundColor.set(preset.ground);
    hemisphere.intensity = preset.hemisphere;
    sun.color.set(preset.key);
    sun.intensity = preset.keyIntensity;
    fill.color.set(preset.fill);
    fill.intensity = preset.fillIntensity;
    renderer.toneMappingExposure = preset.exposure;
    scene.background = preset.background ? new THREE.Color(preset.background) : null;
    place();
    onTheme(next);
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
    dispose() {
      scene.remove(hemisphere, sun, sun.target, fill);
      sun.shadow.dispose();
    },
  };
}

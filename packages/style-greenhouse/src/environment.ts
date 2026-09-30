/* The Greenhouse light rig per theme, from the lighting presets in style.json. */
import * as THREE from "three";
import type { EnvironmentHandle, LightingPreset, StyleTheme } from "@crewhub/world-style";

export function environment(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  presets: Record<StyleTheme, LightingPreset>,
  theme: StyleTheme,
  onTheme: (theme: StyleTheme) => void,
): EnvironmentHandle {
  const hemisphere = new THREE.HemisphereLight();
  const sun = new THREE.DirectionalLight();
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.normalBias = 0.035;
  sun.shadow.bias = -0.0001;
  sun.shadow.radius = 3;
  const fill = new THREE.DirectionalLight();
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: 0.15 }));
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = -0.56;
  contact.receiveShadow = true;
  scene.add(hemisphere, sun, sun.target, fill, contact);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const apply = (next: StyleTheme) => {
    const p = presets[next];
    hemisphere.color.set(p.sky);
    hemisphere.groundColor.set(p.ground);
    hemisphere.intensity = p.hemisphere;
    sun.color.set(p.key);
    sun.intensity = p.keyIntensity;
    sun.position.set(...p.keyPosition);
    fill.color.set(p.fill);
    fill.intensity = p.fillIntensity;
    fill.position.set(...p.fillPosition);
    renderer.toneMappingExposure = p.exposure;
    (contact.material as THREE.ShadowMaterial).opacity = p.shadowOpacity;
    scene.background = p.background ? new THREE.Color(p.background) : null;
    onTheme(next);
  };
  apply(theme);
  return {
    setTheme: apply,
    setShadowReach(reach) {
      Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, far: 120 });
      sun.shadow.camera.updateProjectionMatrix();
    },
    dispose() {
      scene.remove(hemisphere, sun, sun.target, fill, contact);
      sun.shadow.dispose();
      contact.geometry.dispose();
      (contact.material as THREE.Material).dispose();
    },
  };
}

/* Greenhouse ambient life: the small moving things a town is never without. Each key is one mesh on shared geometry, so
   a renderer instances it and moves the instances (apps/world/src/world/ambientLife.ts); nothing here animates itself.
   Forward is +x, up is +y. Glows are additive, so a renderer fades an instance by darkening its instance colour.
   - town.bird: a small slate V seen from below and the side; scaling it in y flaps its wings.
   - town.butterfly: two pale wings tilted up (instance colours tint them); scaling it in z folds them.
   - town.firefly: a soft warm halo, standing up to face the usual view. town.mote: a pale speck of dust in a sunbeam.
   - town.window-glow: a soft warm glow facing +z, set just in front of a lit window pane.
   - town.ripple: a soft pale ring on water, flat; it grows and fades.
   - town.steam: a soft cream puff, rising from a chimney or a cup.
   - town.cloud-shadow: a big, very soft shadow drifting over the ground. */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Kit, Swatch } from "./kit.ts";
import { decalMaterial } from "./shaders.ts";

const materials = new WeakMap<Kit, Map<string, THREE.Material>>();

/** A life material, once per kit (a theme change does not recolour these: each shows in one theme). */
function material(kit: Kit, key: string, create: () => THREE.Material): THREE.Material {
  let cache = materials.get(kit);
  if (!cache) materials.set(kit, (cache = new Map()));
  let m = cache.get(key);
  if (!m) cache.set(key, (m = create()));
  return m;
}

const glow = (kit: Kit, color: Swatch) =>
  material(kit, `glow:${color}`, () => new THREE.MeshBasicMaterial({ color: kit.hex(color), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));

/** An additive glow on a flat quad that fades from its centre (or, with `ring`, from a band at `ring` of its radius);
    the instance colour scales its brightness. */
const softGlow = (kit: Kit, color: Swatch, ring = 0) =>
  material(
    kit,
    `soft:${color}:${ring}`,
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(kit.hex(color)) }, uRing: { value: ring } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: `varying vec2 vUv; varying vec3 vTint;
          void main() { vUv = uv; vTint = vec3(1.0); vec4 p = vec4(position, 1.0);
          #ifdef USE_INSTANCING
          p = instanceMatrix * p;
          #endif
          #ifdef USE_INSTANCING_COLOR
          vTint = instanceColor;
          #endif
          gl_Position = projectionMatrix * modelViewMatrix * p; }`,
        fragmentShader: `uniform vec3 uColor; uniform float uRing; varying vec2 vUv; varying vec3 vTint;
          void main() { float d = length(vUv - 0.5) * 2.0;
          float a = uRing > 0.0 ? 1.0 - smoothstep(0.0, 0.16, abs(d - uRing)) : pow(1.0 - smoothstep(0.0, 1.0, d), 2.0);
          if (d > 1.0) a = 0.0;
          gl_FragColor = vec4(uColor * vTint, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      }),
  );

function lone(geometry: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, m);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

export function bird(kit: Kit): THREE.Mesh {
  const geometry = kit.geometry("life:bird", () => {
    const parts = [new THREE.BoxGeometry(0.2, 0.05, 0.06)];
    for (const side of [-1, 1]) {
      const wing = new THREE.BoxGeometry(0.11, 0.014, 0.42);
      wing.translate(0, 0, side * 0.21);
      wing.rotateX(side * -0.42);
      wing.translate(-0.02, 0.02, 0);
      parts.push(wing);
    }
    const merged = mergeGeometries(parts, false) ?? new THREE.BufferGeometry();
    for (const p of parts) p.dispose();
    return merged;
  });
  return lone(geometry, kit.material("slate"));
}

export function butterfly(kit: Kit): THREE.Mesh {
  const geometry = kit.geometry("life:butterfly", () => {
    const parts: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      const wing = new THREE.CircleGeometry(0.11, 8);
      wing.scale(1.1, 0.85, 1);
      wing.rotateX(-Math.PI / 2);
      wing.translate(0.01, 0, side * 0.1);
      wing.rotateX(side * -0.5);
      parts.push(wing);
    }
    const merged = mergeGeometries(parts, false) ?? new THREE.BufferGeometry();
    for (const p of parts) p.dispose();
    return merged;
  });
  return lone(
    geometry,
    material(kit, "butterfly", () => new THREE.MeshStandardMaterial({ color: kit.hex("paper"), roughness: 0.8, side: THREE.DoubleSide })),
  );
}

export function firefly(kit: Kit): THREE.Mesh {
  // A soft halo around a bright point, lying flat would hide it: it stands up, facing the usual view (+x +z).
  return lone(
    kit.geometry("life:halo", () => new THREE.PlaneGeometry(0.5, 0.5).rotateY(Math.PI / 4)),
    softGlow(kit, "lantern-light"),
  );
}

export function mote(kit: Kit): THREE.Mesh {
  return lone(
    kit.geometry("life:mote", () => new THREE.SphereGeometry(0.018, 6, 4)),
    glow(kit, "cream"),
  );
}

export function windowGlow(kit: Kit): THREE.Mesh {
  return lone(
    kit.geometry("life:window-glow", () => new THREE.PlaneGeometry(0.9, 0.9)),
    softGlow(kit, "lamp-glow"),
  );
}

export function ripple(kit: Kit): THREE.Mesh {
  return lone(
    kit.geometry("life:ripple", () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
    softGlow(kit, "paper", 0.8),
  );
}

export function steam(kit: Kit): THREE.Mesh {
  return lone(
    kit.geometry("life:steam", () => new THREE.SphereGeometry(0.11, 10, 8)),
    material(kit, "steam", () => new THREE.MeshStandardMaterial({ color: kit.hex("cream"), roughness: 1, transparent: true, opacity: 0.55, depthWrite: false })),
  );
}

export function cloudShadow(kit: Kit): THREE.Mesh {
  const mesh = kit.decal("shadow", 2.6, 1.6, 3.4);
  mesh.material = material(kit, "cloud-shadow", () => decalMaterial(kit.hex("contact-shadow"), 0.2, false));
  return mesh;
}

/** Frees the life materials of a kit (its geometries go with the kit). */
export function disposeLife(kit: Kit) {
  for (const m of materials.get(kit)?.values() ?? []) m.dispose();
  materials.delete(kit);
}

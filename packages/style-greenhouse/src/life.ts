/* Greenhouse ambient life: the small moving things a town is never without. Each key is one mesh on shared geometry, so
   a renderer instances it and moves the instances (apps/world/src/world/ambientLife.ts); nothing here animates itself.
   Forward is +x, up is +y. Glows are additive, so a renderer fades an instance by darkening its instance colour.
   - town.bird: a small slate V seen from below and the side; scaling it in y flaps its wings.
   - town.butterfly: two pale wings tilted up (instance colours tint them); scaling it in z folds them.
   - town.firefly: a soft warm halo round a bright core, a billboard that always faces the camera (its shader turns
     it; the instance's x scale sizes it). town.mote: a pale speck of dust in a sunbeam.
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
  // Effects are the same in every look: a look's kit draws them with its root's.
  let cache = materials.get(kit.root);
  if (!cache) materials.set(kit.root, (cache = new Map()));
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

/** The firefly's quad, world units, and the cap on its half-size in clip space (0.011 of the half-height: about 5 px
    on a 900 px canvas). */
const FIREFLY_QUAD = 0.85;
const FIREFLY_CAP = 0.011;

export function firefly(kit: Kit): THREE.Mesh {
  return lone(
    kit.geometry("life:firefly", () => new THREE.PlaneGeometry(FIREFLY_QUAD, FIREFLY_QUAD)),
    material(
      kit,
      "firefly",
      () =>
        new THREE.ShaderMaterial({
          uniforms: { uColor: { value: new THREE.Color(kit.hex("lantern-light")) }, uCore: { value: new THREE.Color(kit.hex("cream")) } },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          // The quad is laid out in view space round the instance's centre, so it faces the camera from any side. Its
          // size on screen is capped (a speck, never a lens flare up close): half the quad at most FIREFLY_CAP of the
          // clip space's half-height, about what it is in the town view.
          vertexShader: `varying vec2 vUv; varying vec3 vTint;
          void main() { vUv = uv; vTint = vec3(1.0); vec4 centre = vec4(0.0, 0.0, 0.0, 1.0); float size = 1.0;
          #ifdef USE_INSTANCING
          centre = instanceMatrix * centre; size = length(instanceMatrix[0].xyz);
          #endif
          #ifdef USE_INSTANCING_COLOR
          vTint = instanceColor;
          #endif
          vec4 view = modelViewMatrix * centre;
          float extent = ${(FIREFLY_QUAD / 2).toFixed(3)} * size * abs(projectionMatrix[1][1]);
          if (!isOrthographic) extent /= max(0.001, -view.z);
          view.xy += position.xy * size * min(1.0, ${FIREFLY_CAP.toFixed(4)} / max(extent, 1e-6));
          gl_Position = projectionMatrix * view; }`,
          fragmentShader: `uniform vec3 uColor; uniform vec3 uCore; varying vec2 vUv; varying vec3 vTint;
          void main() { float d = length(vUv - 0.5) * 2.0;
          if (d > 1.0) discard;
          float halo = pow(1.0 - smoothstep(0.0, 1.0, d), 2.2);
          float core = 1.0 - smoothstep(0.04, 0.16, d);
          float glow = vTint.r;
          gl_FragColor = vec4((uColor * halo * 0.9 + uCore * core) * glow, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
        }),
    ),
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

/* ── Affordances: soft shapes that say "this one" ─────────────────────────────────────────────────────────────── */

/**
 * A flat soft shape at the origin: "outline" glows round a `width` x `depth` rectangle (a focused or hovered plot),
 * "fill" washes it softly (a hovered or focused room's floor), "ring" is a soft circle `width` across (under the
 * selected agent). The size lives in the geometry, so one material serves every size.
 */
export function affordance(kit: Kit, shape: "outline" | "fill" | "ring", width: number, depth: number): THREE.Mesh {
  const soft = shape === "fill" ? 0.5 : shape === "ring" ? 0.14 : 0.9;
  const pad = shape === "fill" ? 0 : soft * 1.5;
  const geometry = kit.geometry(`affordance:${shape}:${width.toFixed(2)},${depth.toFixed(2)}`, () => {
    const plane = new THREE.PlaneGeometry(width + 2 * pad, depth + 2 * pad).rotateX(-Math.PI / 2);
    const data = new Float32Array(plane.attributes.position!.count * 3);
    for (let i = 0; i < data.length; i += 3) data.set([width / 2, depth / 2, soft], i);
    plane.setAttribute("aShape", new THREE.BufferAttribute(data, 3));
    return plane;
  });
  const opacity = shape === "fill" ? 0.2 : shape === "ring" ? 0.9 : 0.8;
  const colour = affordanceColour(kit, shape);
  const m = material(
    kit,
    `affordance:${shape}`,
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(kit.hex(colour)) }, uOpacity: { value: opacity }, uShape: { value: ["outline", "fill", "ring"].indexOf(shape) } },
        transparent: true,
        depthWrite: false,
        vertexShader: `attribute vec3 aShape; varying vec2 vLocal; varying vec3 vShape;
          void main() { vLocal = position.xz; vShape = aShape;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform vec3 uColor; uniform float uOpacity; uniform int uShape; varying vec2 vLocal; varying vec3 vShape;
          void main() {
            float a;
            if (uShape == 2) {
              // A soft ring at the radius.
              a = 1.0 - smoothstep(0.0, vShape.z, abs(length(vLocal) - vShape.x + vShape.z));
            } else {
              vec2 q = abs(vLocal) - vShape.xy;
              float sdf = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
              // Outline: brightest on the edge, fading out and in. Fill: even inside, fading at the edge.
              a = uShape == 0 ? 1.0 - smoothstep(0.0, vShape.z, abs(sdf)) : 1.0 - smoothstep(-vShape.z, 0.0, sdf);
            }
            gl_FragColor = vec4(uColor, uOpacity * a * a);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
  );
  const mesh = lone(geometry, m);
  mesh.renderOrder = 2;
  return mesh;
}

/** The wash takes the focus colour; the outline and the ring a warm accent by day and lantern light in lamplight. */
function affordanceColour(kit: Kit, shape: string): Swatch {
  if (shape === "fill") return "focus-ring";
  return kit.theme === "lamplight" ? "lantern-light" : "tangerine";
}

/** Re-colours the affordances for the kit's current theme. */
export function lifeTheme(kit: Kit) {
  for (const shape of ["outline", "fill", "ring"]) {
    const m = materials.get(kit.root)?.get(`affordance:${shape}`) as THREE.ShaderMaterial | undefined;
    m?.uniforms.uColor!.value.set(kit.hex(affordanceColour(kit, shape)));
  }
}

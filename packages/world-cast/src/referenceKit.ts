/* A plain `FigureKit` without a style: unrounded-looking but honest shapes in the cast's own colours. The contract test
   measures every cast with it (triangles, meshes, batchable materials), and the cast registry falls back to it for a
   style that gives no kit of its own. A style's kit draws the same shapes in its own look. */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { StyleTheme } from "@crewhub/world-style";
import type { CastManifest, FigureHalo, FigureKit, FigurePart } from "./index.ts";

const DEG = Math.PI / 180;
/** CSS colour names for what a cast does not name itself: a style colour, the alert colour and the stale grey. */
const NEUTRAL = "gainsboro";
const RESERVED: Record<string, string> = { alert: "orange", stale: "darkgray" };
const SOFT = 0.45;

export function referenceKit(colors: CastManifest["colors"], theme: StyleTheme = "day"): FigureKit {
  const geometries = new Map<string, THREE.BufferGeometry>();
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const geometry = (key: string, create: () => THREE.BufferGeometry) => {
    let g = geometries.get(key);
    if (!g) geometries.set(key, (g = create()));
    return g;
  };
  const hex = (color: string): string => {
    if (color.startsWith("soft:")) return `#${new THREE.Color(hex(color.slice(5))).lerp(new THREE.Color("white"), SOFT).getHexString()}`;
    return colors[color]?.[theme] ?? `#${new THREE.Color(RESERVED[color] ?? NEUTRAL).getHexString()}`;
  };
  const material: FigureKit["material"] = (color, options) => {
    const key = `${color}|${options?.glow ?? ""}`;
    let m = materials.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: hex(color), roughness: 0.7, metalness: 0 });
      if (options?.glow !== undefined) {
        m.emissive.set(hex(typeof options.glow === "string" ? options.glow : color));
        m.emissiveIntensity = typeof options.glow === "number" ? options.glow : 0.35;
      }
      materials.set(key, m);
    }
    return m;
  };
  const flat = (radius: number, color: string, opacity: number): THREE.Mesh => {
    const mesh = new THREE.Mesh(
      geometry(`disc:${radius}`, () => new THREE.CircleGeometry(radius, 24).rotateX(-Math.PI / 2)),
      new THREE.MeshBasicMaterial({ color: hex(color), transparent: true, opacity, depthWrite: false }),
    );
    mesh.position.y = 0.015;
    return mesh;
  };
  return {
    theme,
    hex,
    material,
    part(part: FigurePart, color: string) {
      const [a, b, c] = part.size;
      let g: THREE.BufferGeometry;
      switch (part.shape) {
        case "box": {
          const radius = Math.min(part.radius ?? 0.04, a / 3, b / 3, c / 3);
          g = geometry(`box:${a},${b},${c},${radius}`, () => (radius <= 0.012 ? new THREE.BoxGeometry(a, b, c) : new RoundedBoxGeometry(a, b, c, radius <= 0.03 ? 1 : 2, radius)));
          break;
        }
        case "cylinder":
          g = geometry(`cylinder:${a},${b},${c}`, () => new THREE.CylinderGeometry(a, c, b, Math.max(a, c) <= 0.04 ? 10 : 20));
          break;
        case "cone":
          g = geometry(`cone:${a},${b}`, () => new THREE.CylinderGeometry(0, a, b, 20));
          break;
        case "sphere":
          g = Math.max(a, b, c) <= 0.05 ? geometry("small-sphere", () => new THREE.SphereGeometry(1, 8, 6)) : geometry("sphere", () => new THREE.SphereGeometry(1, 12, 10));
          break;
        case "torus":
          g = geometry(`torus:${a},${b}`, () => new THREE.TorusGeometry(a, b, 10, 32).rotateX(Math.PI / 2));
          break;
        case "wedge":
          g = geometry(`wedge:${a},${b},${c},${part.sweep ?? 360}`, () => new THREE.CylinderGeometry(a, c, b, 16, 1, false, Math.PI / 2, (part.sweep ?? 360) * DEG));
          break;
      }
      const mesh = new THREE.Mesh(g, material(color));
      if (part.shape === "sphere") mesh.scale.set(a, b, c);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.set(...part.position);
      const [rx, ry, rz] = part.rotation ?? [0, 0, 0];
      mesh.rotation.set(rx * DEG, ry * DEG, rz * DEG, "XYZ");
      return mesh;
    },
    contactShadow(radius) {
      const mesh = flat(radius, "stale", 0.25);
      mesh.userData.decal = true;
      return mesh;
    },
    halo(radius): FigureHalo {
      const mesh = flat(radius * 1.4, "alert", 0.4);
      mesh.position.y = 0.04;
      mesh.visible = false;
      return {
        object: mesh,
        set(active, color) {
          mesh.visible = active;
          (mesh.material as THREE.MeshBasicMaterial).color.set(hex(color));
        },
        update() {},
        dispose: () => (mesh.material as THREE.Material).dispose(),
      };
    },
  };
}

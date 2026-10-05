/* The Greenhouse kit for casts (`FigureKit`, @crewhub/world-cast): figures of any cast are drawn with the style's own
   rounded boxes and shared materials, so they take the theme, the evening's glow and the cloud shadows, and the
   renderer's crowd batches them. A cast's own colours (cast.json) live in the kit under `cast:<id>:<name>`. */
import * as THREE from "three";
import type { CastManifest, FigureHalo, FigureKit } from "@crewhub/world-cast";
import type { Kit } from "./kit.ts";
import { partMesh } from "./parts.ts";
import { haloMaterial } from "./shaders.ts";

/** The reserved names every kit resolves, as Greenhouse swatches; a cast's own colour of that name wins. */
const RESERVED: Record<string, string> = { alert: "beacon", stale: "grey-bot" };
/** The contact shadow and the halo, as shares of the figure's ground radius. */
const SHADOW = { halfX: 0.5, halfZ: 0.4, soft: 0.75 };
const HALO = 3.625;

export function figureKit(kit: Kit, cast: Pick<CastManifest, "id" | "colors">): FigureKit {
  const prefix = `cast:${cast.id}:`;
  kit.castColors(prefix, cast.colors);
  /** A cast or style colour name as the kit's swatch name. */
  const swatch = (color: string): string => {
    if (color.startsWith("soft:")) return `soft:${swatch(color.slice("soft:".length))}`;
    if (color in cast.colors) return prefix + color;
    return RESERVED[color] ?? color;
  };
  return {
    get theme() {
      return kit.theme;
    },
    part: (part, color) => partMesh(kit, part, swatch(color)),
    material: (color, options) => kit.material(swatch(color), options?.glow === undefined ? {} : { glow: typeof options.glow === "string" ? swatch(options.glow) : options.glow }),
    hex: (color) => kit.hex(swatch(color)),
    contactShadow(radius) {
      const blob = kit.decal("shadow", radius * SHADOW.halfX, radius * SHADOW.halfZ, radius * SHADOW.soft);
      blob.position.y = 0.015;
      return blob;
    },
    halo(radius): FigureHalo {
      const size = radius * HALO;
      const material = haloMaterial(kit.hex("beacon"));
      const ring = new THREE.Mesh(kit.geometry(`halo:${size.toFixed(3)}`, () => new THREE.PlaneGeometry(size, size)), material);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.04;
      // An inactive halo draws nothing: no draw call.
      ring.visible = false;
      return {
        object: ring,
        set(active, color) {
          ring.visible = active;
          material.uniforms.uActive!.value = active ? 0.65 : 0;
          material.uniforms.uColor!.value.set(kit.hex(swatch(color)));
        },
        update(seconds) {
          material.uniforms.uTime!.value += seconds;
        },
        dispose: () => material.dispose(),
      };
    },
  };
}

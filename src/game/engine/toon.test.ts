import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { toonGradientMap, toonify } from "./toon";

describe("toonGradientMap", () => {
  it("caches one 3-step texture", () => {
    const a = toonGradientMap();
    expect(a).toBe(toonGradientMap());
    expect(a.image.width).toBe(3);
  });
});

describe("toonify", () => {
  it("swaps every material for toon, keeping color, and sets shadow flags", () => {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial({ color: "#ff8800" }),
    );
    const child = new THREE.Mesh(new THREE.SphereGeometry(), [
      new THREE.MeshStandardMaterial({ color: "#00ff88" }),
      new THREE.MeshStandardMaterial({ color: "#0088ff" }),
    ]);
    mesh.add(child);
    group.add(mesh);

    toonify(group);

    expect(mesh.material).toBeInstanceOf(THREE.MeshToonMaterial);
    expect((mesh.material as unknown as THREE.MeshToonMaterial).color.getHexString()).toBe("ff8800");
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);
    const mats = child.material as unknown as THREE.MeshToonMaterial[];
    expect(mats).toHaveLength(2);
    expect(mats[0]).toBeInstanceOf(THREE.MeshToonMaterial);
    expect(mats[1]?.color.getHexString()).toBe("0088ff");
  });

  it("removes ghost primitives carrying the glTF default material", () => {
    const group = new THREE.Group();
    const real = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial({ color: "#00aa00" }),
    );
    const ghostMat = new THREE.MeshStandardMaterial();
    ghostMat.name = "_defaultMat";
    const ghost = new THREE.Mesh(new THREE.BoxGeometry(), ghostMat);
    group.add(real, ghost);

    toonify(group);

    expect(group.children).toContain(real);
    expect(group.children).not.toContain(ghost);
    expect(real.material).toBeInstanceOf(THREE.MeshToonMaterial);
  });

  it("shifts cyan-range foliage toward leafy green only when asked", () => {
    const mint = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial({ color: "#7fe0c3" }),
    );
    const group = new THREE.Group();
    group.add(mint);

    toonify(group, { foliageHueFix: true });

    const hsl = { h: 0, s: 0, l: 0 };
    (mint.material as unknown as THREE.MeshToonMaterial).color.getHSL(hsl);
    expect(hsl.h).toBeGreaterThan(0.25);
    expect(hsl.h).toBeLessThan(0.36); // leafy green band, not cyan
  });
});

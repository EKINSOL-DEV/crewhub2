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
});

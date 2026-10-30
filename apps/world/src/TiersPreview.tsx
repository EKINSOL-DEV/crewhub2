/* Review-only page at /tiers-preview: the settlement's dressing at any size, without the demo. `?n=7` is the number of
   projects (0 to 40), `&zones=3` spreads them over that many zones, `&archived=2` boards up the last ones,
   `&theme=lamplight` starts in lamplight, `&fit=centre` frames the central district only and `&fit=x0,x1,z0,z1` any
   rectangle of the ground. Buildings are plain blocks:
   the page shows the ground, the civic pieces and the landmarks each tier gets. Not linked from the UI. */
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { ModelKey, StyleTheme } from "@crewhub/world-style";
import { Button } from "./components/primitives";
import { instanceStatic } from "./world/instanceStatic";
import { mergeStatic } from "./world/mergeStatic";
import { fixturePlan } from "./world/planFixture";
import { planPieces, settlementDressing } from "./world/settlementDressing";
import { DEFAULT_STYLE_ID, styleRegistry } from "./world/style";
import { LAWN_Y } from "./world/townDressing";

const params = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
const count = Math.max(0, Math.min(40, Number(params.get("n") ?? 4) || 0));
const zones = Math.max(1, Math.min(4, Number(params.get("zones") ?? 1) || 1));
const archived = Math.max(0, Math.min(count, Number(params.get("archived") ?? 0) || 0));
const { plan, dress } = fixturePlan(count, zones, archived);

function Canvas({ angle, theme }: { angle: number; theme: StyleTheme }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.setAttribute("aria-hidden", "true");
    el.prepend(renderer.domElement);
    const style = styleRegistry.getStyle(DEFAULT_STYLE_ID);
    const scene = new THREE.Scene();
    const environment = style.environment(scene, renderer, theme);
    const content = new THREE.Group();
    for (const d of settlementDressing(dress)) {
      const object = style.model(d.key as ModelKey, {
        ...(d.size ? { size: d.size } : {}),
        ...(d.seed !== undefined ? { seed: d.seed } : {}),
        ...(d.variant ? { variant: d.variant } : {}),
        ...(d.text ? { text: d.text } : {}),
        ...(d.accent ? { accent: d.accent as never } : {}),
      });
      object.position.set(d.x, d.y, d.z);
      object.rotation.y = d.rotation;
      object.scale.setScalar(d.scale);
      content.add(object);
    }
    const instanced = instanceStatic(content);
    const merged = mergeStatic(content);
    const pieces = new THREE.Group();
    for (const p of planPieces(dress)) {
      const object = style.model(p.key as ModelKey);
      object.position.set(p.x, p.y, p.z);
      object.rotation.y = p.rotation;
      object.scale.setScalar(p.scale);
      pieces.add(object);
    }
    // The buildings as plain blocks, an archived one darker.
    const wall = new THREE.MeshStandardMaterial({ color: style.color("chalk", theme), roughness: 0.8 }),
      closed = new THREE.MeshStandardMaterial({ color: style.color("clay", theme), roughness: 0.8 });
    const blocks = new THREE.Group();
    for (const lot of dress.lots) {
      const b = lot.obstacles[0]!;
      const block = new THREE.Mesh(new THREE.BoxGeometry(b.maxX - b.minX - 0.6, 1.9, b.maxZ - b.minZ - 0.6), lot.archived ? closed : wall);
      block.position.set((b.minX + b.maxX) / 2, LAWN_Y + 0.95, (b.minZ + b.maxZ) / 2);
      block.castShadow = block.receiveShadow = true;
      blocks.add(block);
    }
    scene.add(content, pieces, blocks);
    const fit = (params.get("fit") ?? "").split(",").map(Number);
    const g = params.get("fit") === "centre" ? { minX: -66, maxX: 66, minZ: -72, maxZ: 12 } : fit.length === 4 && fit.every(Number.isFinite) ? { minX: fit[0]!, maxX: fit[1]!, minZ: fit[2]!, maxZ: fit[3]! } : dress.ground;
    const centre = new THREE.Vector3((g.minX + g.maxX) / 2, 0, (g.minZ + g.maxZ) / 2);
    const reach = Math.hypot(g.maxX - g.minX, g.maxZ - g.minZ) / 2;
    environment.setShadowReach(reach + 4, { x: centre.x, z: centre.z });
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, reach * 6 + 200);
    const azimuth = (angle * Math.PI) / 180;
    const away = reach * 2 + 60;
    camera.position.set(centre.x + Math.sin(azimuth) * away, away * 0.8, centre.z + Math.cos(azimuth) * away);
    camera.lookAt(centre);
    camera.updateMatrixWorld();
    const view = new THREE.Box3();
    for (let i = 0; i < 8; i++) view.expandByPoint(new THREE.Vector3(i & 1 ? g.maxX : g.minX, i & 2 ? 4 : -1, i & 4 ? g.maxZ : g.minZ).applyMatrix4(camera.matrixWorldInverse));
    const draw = () => {
      const width = el.clientWidth,
        height = el.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      const aspect = width / height;
      let halfW = (view.max.x - view.min.x) / 2 + 1,
        halfH = (view.max.y - view.min.y) / 2 + 1;
      if (halfW / halfH > aspect) halfH = halfW / aspect;
      else halfW = halfH * aspect;
      const cx = (view.max.x + view.min.x) / 2,
        cy = (view.max.y + view.min.y) / 2;
      Object.assign(camera, { left: cx - halfW, right: cx + halfW, top: cy + halfH, bottom: cy - halfH });
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      el.dataset.calls = String(renderer.info.render.calls);
    };
    const observer = new ResizeObserver(draw);
    observer.observe(el);
    draw();
    return () => {
      observer.disconnect();
      for (const mesh of instanced) mesh.dispose();
      for (const geometry of merged) geometry.dispose();
      blocks.traverse((o) => o instanceof THREE.Mesh && o.geometry.dispose());
      wall.dispose();
      closed.dispose();
      environment.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [angle, theme]);
  return <div ref={host} className="tiers-preview" style={{ position: "relative", height: "calc(100vh - 110px)", minHeight: 320 }} />;
}

export default function TiersPreview() {
  const [angle, setAngle] = useState(0);
  const [theme, setTheme] = useState<StyleTheme>(params.get("theme") === "lamplight" ? "lamplight" : "day");
  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", padding: 16 }}>
      <header style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>
          Tier preview (review only): {plan.tier}, {count} {count === 1 ? "project" : "projects"}
          {zones > 1 ? ` in ${zones} zones` : ""}
        </h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Button onClick={() => setAngle((a) => a - 30)}>Turn left</Button>
          <Button onClick={() => setAngle((a) => a + 30)}>Turn right</Button>
          <Button onClick={() => setTheme((t) => (t === "day" ? "lamplight" : "day"))}>{theme === "day" ? "Lamplight" : "Day"}</Button>
        </div>
      </header>
      <p style={{ marginTop: 8, color: "var(--text-muted)" }}>
        The ground, civic pieces and landmarks of this settlement; buildings are plain blocks. Landmarks: {plan.landmarks.join(", ") || "none yet"}.
      </p>
      <Canvas angle={angle} theme={theme} />
    </main>
  );
}

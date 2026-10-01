/* Review-only page at /props-preview: every prop-builder example, validated exactly as the world imports it, drawn with
   the parts renderer on a grid with its footprint outlined, its approach cells marked and its name. Not linked from the
   UI; the Dev Lead uses it to check that example and eval props render. `?group=style` instead draws every model the
   town style covers, by key and in day or lamplight, so a model can be judged on its own (`&only=civic,post-office`
   narrows it to keys starting with those words; `&theme=lamplight` starts in lamplight). */
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { PROP_LIMITS, validatePropModel, type PropIssue, type PropModel } from "@crewhub/world-engine";
import { Button, Card } from "./components/primitives";
import type { ModelKey, StyleTheme } from "@crewhub/world-style";
import { DEFAULT_STYLE_ID, styleRegistry } from "./world/style";

/* Three groups: the skill's examples, the skill's eval runs, and the demo world's prop tickets (its broken sign shows
   as an invalid card, on purpose). `?group=eval` or `?group=demo` narrows the page to one group. */
const groups: Record<string, Record<string, unknown>> = {
  examples: import.meta.glob<unknown>("../../../skills/prop-builder/references/examples/*.json", {
    eager: true,
    import: "default",
  }),
  eval: import.meta.glob<unknown>("../../../skills/prop-builder/evals/*/*.json", { eager: true, import: "default" }),
  demo: import.meta.glob<unknown>("../../../packages/demo/src/props/*.json", { eager: true, import: "default" }),
};
const params = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
const only = params.get("group");
const styleGroup = only === "style";
const files: Record<string, unknown> = Object.fromEntries(
  Object.entries(groups)
    .filter(([group]) => !only || group === only)
    .flatMap(([group, found]) =>
      Object.entries(found).map(([path, json]) => [`${group}/${path.split("/").pop() ?? path}`, json]),
    ),
);

type Entry =
  | { file: string; ok: true; model: PropModel; warnings: PropIssue[] }
  | { file: string; ok: false; errors: PropIssue[] };

const entries: Entry[] = Object.entries(files)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, json]) => {
    const file = path;
    const result = validatePropModel(json);
    return result.ok
      ? { file, ok: true, model: result.value, warnings: result.warnings }
      : { file, ok: false, errors: result.errors };
  });
const valid = entries.filter((e): e is Extract<Entry, { ok: true }> => e.ok);

const CELL = PROP_LIMITS.cellSize;
const GAP = 1.1;

/** Lays the tiles out in rows, left to right, each centred on its own tile. */
function layout(tiles: { w: number; d: number }[], rowWidth: number, gap = GAP) {
  const spots: { x: number; z: number }[] = [];
  let x = 0,
    z = 0,
    rowDepth = 0;
  for (const { w, d } of tiles) {
    if (x > 0 && x + w > rowWidth) {
      x = 0;
      z += rowDepth + gap;
      rowDepth = 0;
    }
    spots.push({ x: x + w / 2, z: z + d / 2 });
    x += w + gap;
    rowDepth = Math.max(rowDepth, d);
  }
  return spots;
}

function outline(width: number, depth: number, material: THREE.LineBasicMaterial) {
  const w = width / 2,
    d = depth / 2;
  const points = [
    [-w, -d],
    [w, -d],
    [w, d],
    [-w, d],
    [-w, -d],
  ].map(([x, z]) => new THREE.Vector3(x, 0.032, z));
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
}

interface Label {
  id: string;
  name: string;
  left: number;
  top: number;
}

/* The style group: every covered key (or those `only` names), drawn by the style itself. */
const styleKeys: ModelKey[] = (() => {
  const prefixes = (params.get("only") ?? "").split(",").filter(Boolean);
  const keys = styleRegistry.getStyle(DEFAULT_STYLE_ID).manifest.coveredKeys ?? [];
  return keys.filter((k) => !prefixes.length || prefixes.some((p) => k.startsWith(p))) as ModelKey[];
})();

function PreviewCanvas({ angle, theme }: { angle: number; theme: StyleTheme }) {
  const host = useRef<HTMLDivElement>(null);
  const [labels, setLabels] = useState<Label[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.setAttribute("aria-hidden", "true");
    el.prepend(renderer.domElement);

    // The town default style draws the props, with its day light rig.
    const style = styleRegistry.getStyle(DEFAULT_STYLE_ID);
    const scene = new THREE.Scene();
    const lines: THREE.Line[] = [];
    const lineMaterial = new THREE.LineBasicMaterial({ color: style.color("coral", "day") });
    const approachMaterial = new THREE.LineBasicMaterial({ color: style.color("slate", "day") });
    const environment = style.environment(scene, renderer, theme);
    const content = new THREE.Group();
    const anchors: { id: string; name: string; point: THREE.Vector3 }[] = [];

    if (styleGroup) {
      // Each model on a lawn tile the size of its bounds; big models (the civic buildings) get wider rows.
      const objects = styleKeys.map((key) => style.model(key));
      const sizes = objects.map((o) => new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()));
      const tiles = sizes.map((s) => ({ w: Math.max(1, s.x) + 0.6, d: Math.max(1, s.z) + 0.6 }));
      const widest = Math.max(...tiles.map((t) => t.w), 4);
      const spots = layout(tiles, Math.max(widest, el.clientWidth < 640 ? widest : 26), 0.8);
      objects.forEach((object, i) => {
        const spot = spots[i]!,
          tile = tiles[i]!;
        const lawn = style.model("plot", { size: { width: tile.w, height: 0.16, depth: tile.d } });
        lawn.position.set(spot.x, -0.17, spot.z);
        content.add(lawn);
        const centre = new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
        object.position.set(spot.x - centre.x, 0, spot.z - centre.z);
        content.add(object);
        anchors.push({
          id: styleKeys[i]!,
          name: styleKeys[i]!,
          point: new THREE.Vector3(spot.x, -0.1, spot.z + tile.d / 2),
        });
      });
    }

    const models = styleGroup ? [] : valid.map((e) => e.model);
    // Narrow screens get narrower rows, so the props stay large enough to judge.
    const spots = layout(
      models.map((m) => ({ w: m.footprint.width * CELL, d: m.footprint.depth * CELL })),
      el.clientWidth < 640 ? 3.2 : 4.6,
    );
    models.forEach((m, i) => {
      const spot = spots[i]!;
      const w = m.footprint.width * CELL,
        d = m.footprint.depth * CELL;
      const tile = new THREE.Group();
      tile.position.set(spot.x, 0, spot.z);
      const plinth = style.model("path", { size: { width: w + 0.3, height: 0.04, depth: d + 0.3 } });
      plinth.position.y = -0.02;
      tile.add(plinth);
      const border = outline(w, d, lineMaterial);
      lines.push(border);
      tile.add(border);
      for (const c of m.approaches) {
        const mark = outline(CELL * 0.6, CELL * 0.6, approachMaterial);
        mark.position.set((c.x + 0.5) * CELL - w / 2, 0, (c.z + 0.5) * CELL - d / 2);
        lines.push(mark);
        tile.add(mark);
      }
      const prop = style.parts(m);
      prop.position.y = 0.025;
      tile.add(prop);
      content.add(tile);
      anchors.push({ id: m.id, name: m.name, point: new THREE.Vector3(spot.x, -0.1, spot.z + d / 2 + 0.2) });
    });
    const box = new THREE.Box3().setFromObject(content);
    const centre = box.getCenter(new THREE.Vector3());
    content.position.sub(new THREE.Vector3(centre.x, 0, centre.z));
    anchors.forEach((a) => a.point.sub(new THREE.Vector3(centre.x, 0, centre.z)));
    scene.add(content);
    environment.setShadowReach(box.getSize(new THREE.Vector3()).length() / 2);

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    const azimuth = (angle * Math.PI) / 180;
    camera.position.set(Math.sin(azimuth) * 14, 11, Math.cos(azimuth) * 14);
    camera.lookAt(0, 0.5, 0);

    // Fit the camera to the content: the extents of the content's bounds in view space, with a margin for labels.
    camera.updateMatrixWorld();
    const view = new THREE.Box3();
    const shifted = box.clone().translate(new THREE.Vector3(-centre.x, 0, -centre.z));
    for (let i = 0; i < 8; i++)
      view.expandByPoint(
        new THREE.Vector3(
          i & 1 ? shifted.max.x : shifted.min.x,
          i & 2 ? shifted.max.y : shifted.min.y,
          i & 4 ? shifted.max.z : shifted.min.z,
        ).applyMatrix4(camera.matrixWorldInverse),
      );
    let last = performance.now(),
      raf = 0;
    const animated: ((seconds: number) => void)[] = [];
    content.traverse((o) => typeof o.userData.animate === "function" && animated.push(o.userData.animate));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tick = (now: number) => {
      const seconds = Math.min(0.1, (now - last) / 1000);
      last = now;
      for (const animate of animated) animate(seconds);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    if (animated.length && !reduced) raf = requestAnimationFrame(tick);
    const draw = () => {
      const width = el.clientWidth,
        height = el.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      const aspect = width / height;
      const margin = 0.35;
      let halfW = (view.max.x - view.min.x) / 2 + margin,
        halfH = (view.max.y - view.min.y) / 2 + margin;
      if (halfW / halfH > aspect) halfH = halfW / aspect;
      else halfW = halfH * aspect;
      const cx = (view.max.x + view.min.x) / 2,
        cy = (view.max.y + view.min.y) / 2;
      Object.assign(camera, { left: cx - halfW, right: cx + halfW, top: cy + halfH, bottom: cy - halfH });
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      setLabels(
        anchors.map((a) => {
          const p = a.point.clone().project(camera);
          return { id: a.id, name: a.name, left: ((p.x + 1) / 2) * width, top: ((1 - p.y) / 2) * height };
        }),
      );
    };
    const observer = new ResizeObserver(draw);
    observer.observe(el);
    draw();
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      lines.forEach((l) => l.geometry.dispose());
      lineMaterial.dispose();
      approachMaterial.dispose();
      environment.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [angle, theme]);

  if (failed) return <p role="status">This browser cannot draw 3D graphics, so only the list below is available.</p>;
  return (
    <div ref={host} style={{ position: "relative", height: "min(70vh, 640px)", minHeight: 320 }}>
      {labels.map((l) => (
        <span
          key={l.id}
          style={{
            position: "absolute",
            left: l.left,
            top: l.top,
            transform: "translate(-50%, 0)",
            padding: "2px 8px",
            borderRadius: 999,
            background: "var(--surface)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            fontSize: 12,
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          {l.name}
        </span>
      ))}
    </div>
  );
}

export default function PropsPreview() {
  const [angle, setAngle] = useState(35);
  const [theme, setTheme] = useState<StyleTheme>(params.get("theme") === "lamplight" ? "lamplight" : "day");
  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", padding: 16 }}>
      <header style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 20, marginRight: "auto" }}>Prop preview (review only)</h1>
        <Button onClick={() => setAngle((a) => a - 45)}>Turn left</Button>
        <Button onClick={() => setAngle((a) => a + 45)}>Turn right</Button>
        <Button onClick={() => setTheme((t) => (t === "day" ? "lamplight" : "day"))}>
          {theme === "day" ? "Lamplight" : "Day"}
        </Button>
      </header>
      {styleGroup ? (
        <p style={{ marginTop: 0, color: "var(--text-muted)" }}>
          {styleKeys.length} models of the town style, each on a lawn tile the size of its bounds, in{" "}
          {theme === "day" ? "day" : "lamplight"}.
        </p>
      ) : (
        <p style={{ marginTop: 0, color: "var(--text-muted)" }}>
          {valid.length} of {entries.length} props valid (examples, eval runs and demo props; the demo's broken sign is
          invalid on purpose). The coloured outline is the footprint the grid engine uses; grey squares are approach
          cells.
        </p>
      )}
      <PreviewCanvas angle={angle} theme={theme} />
      {!styleGroup && (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            display: "grid",
            gap: 8,
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          }}
        >
          {entries.map((e) => (
            <li key={e.file}>
              <Card>
                <Card.Header title={e.ok ? e.model.name : `Invalid: ${e.file}`} headingLevel={2} />
                <Card.Body>
                  {e.ok ? (
                    <>
                      <p style={{ margin: 0 }}>
                        <code>{e.model.id}</code> · {e.model.category} · {e.model.footprint.width}×
                        {e.model.footprint.depth} cells · {e.model.parts.length} parts ·{" "}
                        {e.model.blocksMovement ? "blocks" : "walkable"}
                      </p>
                      {e.warnings.map((w) => (
                        <p key={w.path + w.message} style={{ margin: 0, color: "var(--text-muted)" }}>
                          Warning: {w.path}: {w.message}
                        </p>
                      ))}
                    </>
                  ) : (
                    <ul>
                      {e.errors.map((err) => (
                        <li key={err.path + err.message}>
                          {err.path}: {err.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card.Body>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

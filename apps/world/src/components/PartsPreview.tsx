/* A small live preview of one parts prop, drawn by the style's own `parts()` on its footprint tile. Renders on
   demand: once per change of the prop or the theme. */
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { PROP_LIMITS, type PropModel } from "@crewhub/world-engine";
import type { StyleTheme } from "@crewhub/world-style";
import { DEFAULT_STYLE_ID, styleRegistry } from "../world/style";

const CELL = PROP_LIMITS.cellSize;

export function PartsPreview({ prop, theme, styleId = DEFAULT_STYLE_ID }: { prop: PropModel; theme: StyleTheme; styleId?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<{ renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.OrthographicCamera; content: THREE.Group; setTheme: (theme: StyleTheme) => void; dispose: () => void } | null>(null);
  const [failed, setFailed] = useState(false);
  const style = styleRegistry.getStyle(styleId);

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
    renderer.setClearColor(0, 0);
    renderer.shadowMap.enabled = true;
    renderer.domElement.setAttribute("aria-hidden", "true");
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    // The preview follows the app's theme, so it never switches the shared style's look under the town.
    const environment = style.environment(scene, renderer, theme);
    environment.setShadowReach(3);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
    camera.position.set(4, 3.6, 4.6);
    camera.lookAt(0, 0.35, 0);
    const content = new THREE.Group();
    scene.add(content);
    stage.current = {
      renderer,
      scene,
      camera,
      content,
      setTheme: (next) => environment.setTheme(next),
      dispose: () => {
        environment.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      },
    };
    return () => {
      stage.current?.dispose();
      stage.current = null;
    };
    // The stage lives as long as the component; the prop and theme redraw through the effect below.
  }, []);

  useEffect(() => {
    const s = stage.current;
    const el = host.current;
    if (!s || !el) return;
    s.setTheme(theme);
    s.content.clear();
    const w = prop.footprint.width * CELL,
      d = prop.footprint.depth * CELL;
    const tile = style.model("path", { size: { width: w, height: 0.04, depth: d } });
    tile.position.y = -0.02;
    s.content.add(tile);
    try {
      s.content.add(style.parts(prop));
    } catch {
      // A draft mid-edit can be unrenderable (a zero size); the tile still shows.
    }
    const box = new THREE.Box3().setFromObject(s.content);
    const span = Math.max(1.2, box.getSize(new THREE.Vector3()).length() * 0.75);
    const width = el.clientWidth || 280,
      height = el.clientHeight || 200;
    s.renderer.setSize(width, height, false);
    const aspect = width / height;
    s.camera.left = (-span * aspect) / 2;
    s.camera.right = (span * aspect) / 2;
    s.camera.top = span / 2;
    s.camera.bottom = -span / 2;
    s.camera.lookAt(0, (box.max.y + box.min.y) / 2, 0);
    s.camera.updateProjectionMatrix();
    s.renderer.render(s.scene, s.camera);
  }, [prop, style, theme]);

  return (
    <div ref={host} className="parts-preview" role="img" aria-label={`Preview of ${prop.name}: ${prop.parts.length} part${prop.parts.length === 1 ? "" : "s"}`}>
      {failed && <p className="sign-muted">3D preview is not available here.</p>}
    </div>
  );
}

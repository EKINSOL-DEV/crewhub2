/* The frame rate overlay (Settings or F; off by default): fps, frame time, the work per frame, draw calls, memory and
   the Graphics setting, and the cast in view on its last line. It reads the scene four times a second and writes its text straight into a fixed-size box: no
   React state, no layout change. The same numbers go to `window.__worldPerf` for the measurement scripts, and
   `window.__worldPerfWindow(ms)` gives them over a longer window (up to the ring's 2048 frames). */
import { useEffect, useRef } from "react";
import type { TownScene, WorldPerf } from "../world/TownScene";

const TICK_MS = 250;
const QUALITY = { pretty: "Pretty", fast: "Fast" } as const;

const ms = (v: number) => v.toFixed(1);
const count = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e4 ? `${(v / 1e3).toFixed(0)}k` : `${v}`);

/** The overlay's lines for a sample (pure; exported for the text view of a sample in scripts and tests). */
export function perfLines(p: WorldPerf): [string, string, string, string, string, string] {
  return [
    p.idle ? `idle · ${QUALITY[p.quality]}` : `${p.fps} fps · ${QUALITY[p.quality]}`,
    p.frames ? `frame ${ms(p.frameMean)} · p95 ${ms(p.frameP95)} ms` : "frame –",
    p.frames ? `work ${ms(p.workMean)} · p95 ${ms(p.workP95)} ms` : "work –",
    `${count(p.calls)} calls · ${count(p.triangles)} tris`,
    `${p.geometries} geo · ${p.textures} tex${p.heap === null ? "" : ` · ${(p.heap / 1048576).toFixed(0)} MB`}`,
    `cast ${p.cast}`,
  ];
}

export function FpsOverlay({ scene }: { scene: { current: TownScene | null } }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const lines = Array.from(box.current?.children ?? []) as HTMLElement[];
    const target = window as unknown as { __worldPerf?: WorldPerf | null; __worldPerfWindow?: ((ms: number) => WorldPerf | null) | null };
    target.__worldPerfWindow = (ms) => scene.current?.perf(ms) ?? null;
    const tick = () => {
      const perf = scene.current?.perf();
      if (!perf) return;
      target.__worldPerf = perf;
      perfLines(perf).forEach((text, i) => {
        const line = lines[i];
        if (line && line.textContent !== text) line.textContent = text;
      });
    };
    tick();
    const id = window.setInterval(tick, TICK_MS);
    return () => {
      window.clearInterval(id);
      target.__worldPerf = null;
      target.__worldPerfWindow = null;
    };
  }, [scene]);
  return (
    <div ref={box} className="fps-overlay" role="status" aria-live="off" aria-label="Frame rate">
      <span className="fps-head" />
      <span />
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

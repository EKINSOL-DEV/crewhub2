// Debug HUD (EKI-77): dev-flag only — append `?worldDebug` to the app URL.
// Ships zero overhead otherwise: the probe isn't even mounted.
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";

export function worldDebugEnabled(): boolean {
  try {
    return new URLSearchParams(window.location.search).has("worldDebug");
  } catch {
    return false;
  }
}

/** Inside-canvas fps sampler (≈2 samples/s so the HUD itself stays cheap). */
export function FpsProbe({ onSample }: { onSample: (fps: number) => void }) {
  const frames = useRef(0);
  const last = useRef(0); // set on the first frame — render must stay pure
  useFrame(() => {
    const now = performance.now();
    if (last.current === 0) {
      last.current = now;
      return;
    }
    frames.current += 1;
    const elapsed = now - last.current;
    if (elapsed >= 500) {
      onSample(Math.round((frames.current * 1000) / elapsed));
      frames.current = 0;
      last.current = now;
    }
  });
  return null;
}

export function WorldHudOverlay({
  fps,
  bots,
  rooms,
  frameloop,
}: {
  fps: number;
  bots: number;
  rooms: number;
  frameloop: string;
}) {
  return (
    <div className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-black/60 px-2 py-1 font-mono text-[10px] text-lime-300">
      {fps} fps · frameloop {frameloop} · {bots} bots · {rooms} rooms
    </div>
  );
}

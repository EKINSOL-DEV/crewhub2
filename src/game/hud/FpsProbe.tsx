// FPS sampling inside the frameloop (M0 T12) — the WorldHud approach.
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";

export function FpsProbe({ onSample }: { onSample: (fps: number) => void }) {
  const frames = useRef(0);
  const t0 = useRef(0);
  useFrame(({ clock }) => {
    frames.current += 1;
    const t = clock.elapsedTime;
    if (t - t0.current >= 1) {
      onSample(Math.round(frames.current / (t - t0.current)));
      frames.current = 0;
      t0.current = t;
    }
  });
  return null;
}

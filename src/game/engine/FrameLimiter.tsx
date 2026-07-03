// Frame limiter (perf loop iter 1): the canvas runs frameloop="demand" and
// this component decides when frames actually happen. Uncapped, R3F renders
// at the display's refresh rate — 120Hz on ProMotion Macs — with the full
// post chain every frame, pinning a core to show an idle plaza. 60fps is
// visually identical for this game; an unfocused window drops to 15fps so a
// campus left open in the background stops warming laps.
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";

const FOCUSED_FPS = 60;
const BLURRED_FPS = 15;
/** Shadow maps re-render the whole scene; every 2nd frame (30Hz) is plenty
 *  for walking robots and drifting clouds on an otherwise static campus. */
const SHADOW_EVERY_N_FRAMES = 2;

export function FrameLimiter() {
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const fps = document.hasFocus() ? FOCUSED_FPS : BLURRED_FPS;
      // -0.5ms slack: at exactly 120Hz the 16.67ms gate would skip frames.
      if (t - last >= 1000 / fps - 0.5) {
        last = t;
        invalidate();
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [invalidate]);

  // Shadow throttling mutates the renderer imperatively — done through the
  // frame-state param (like GameCameraRig mutates state.camera), which the
  // react-compiler immutability rule permits, unlike hook-returned values.
  const frame = useRef(0);
  useFrame((state) => {
    if (frame.current === 0) {
      state.gl.shadowMap.autoUpdate = false;
      state.gl.shadowMap.needsUpdate = true; // first frame must have shadows
    }
    frame.current += 1;
    if (frame.current % SHADOW_EVERY_N_FRAMES === 0) state.gl.shadowMap.needsUpdate = true;
  });

  return null;
}

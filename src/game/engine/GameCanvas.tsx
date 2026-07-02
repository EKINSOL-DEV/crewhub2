// The one R3F canvas of the game (M0 T1). Renderer defaults live here so
// every scene gets the same grounded look: ACES filmic, PCF shadows,
// antialias off (the composer's MSAA takes over in T11).
import type { ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { ACESFilmicToneMapping, PCFShadowMap } from "three";

export function GameCanvas({ children }: { children: ReactNode }) {
  return (
    <Canvas
      shadows={{ type: PCFShadowMap }}
      dpr={[1, 1.5]}
      camera={{ position: [18, 20, 26], fov: 40, near: 0.5, far: 300 }}
      gl={{ toneMapping: ACESFilmicToneMapping, antialias: false }}
      fallback={null}
    >
      {children}
    </Canvas>
  );
}

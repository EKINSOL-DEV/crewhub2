// The post chain (M0 T11), quality-aware: N8AO grounds objects, the ink
// outline draws the world, a soft vignette frames the diorama.
import { useMemo } from "react";
import { EffectComposer, N8AO, Vignette } from "@react-three/postprocessing";
import { QUALITY, useQuality } from "@/game/engine/quality";
import { InkOutlineEffect } from "./ink-outline";

export function Effects() {
  const tier = useQuality((s) => s.tier);
  const cfg = QUALITY[tier];
  const outline = useMemo(() => new InkOutlineEffect(), []);

  if (cfg.ssao) {
    return (
      <EffectComposer multisampling={cfg.multisampling}>
        {/* halfRes: AO at half resolution is visually indistinguishable on
            this flat-toon art and roughly quarters the AO pass cost. */}
        <N8AO aoRadius={1.4} intensity={2.2} distanceFalloff={1} halfRes />
        <primitive object={outline} />
        <Vignette eskil={false} offset={0.22} darkness={0.5} />
      </EffectComposer>
    );
  }
  return (
    <EffectComposer multisampling={cfg.multisampling}>
      <primitive object={outline} />
      <Vignette eskil={false} offset={0.22} darkness={0.5} />
    </EffectComposer>
  );
}

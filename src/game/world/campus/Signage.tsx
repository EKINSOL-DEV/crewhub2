// Measured signage plate (live-feedback fix: "die titels zien er nog echt
// slecht uit") — the HQ plate and the project roof plates used fixed-size
// (or bare) backdrops, so long names overflowed the plate and the icon
// floated outside it. This billboard measures the laid-out text via troika's
// onSync metrics (same approach as @/game/engine/TextBubble) and sizes a
// rounded slate plate around it, with an optional inline color dot.
// The Text is wrapped in its OWN Suspense here (M1 troika lesson) so the
// plate + dot render immediately while the font loads — callers need no
// extra boundary.
import { Suspense, useState } from "react";
import { Billboard, RoundedBox, Text } from "@react-three/drei";

const PAD_X = 0.28;
const PAD_Y = 0.18;
const PLATE_COLOR = "#1f2430";
const PLATE_OPACITY = 0.78;
const DOT_RADIUS = 0.11;
/** Gap between the dot and the text block when a dot is shown. */
const DOT_GAP = 0.16;

interface TroikaSync {
  textRenderInfo?: { blockBounds: [number, number, number, number] };
}

export function Signage({
  position,
  text,
  fontSize = 0.34,
  textColor = "#f5efe0",
  /** Optional accent dot (e.g. the linked project's color) inside the plate, left of the text. */
  dotColor,
}: {
  position: readonly [number, number, number];
  text: string;
  fontSize?: number;
  textColor?: string;
  dotColor?: string | null;
}) {
  const [textSize, setTextSize] = useState({ w: 1, h: fontSize * 1.2 });

  const onSync = (troika: TroikaSync) => {
    const b = troika.textRenderInfo?.blockBounds;
    if (!b) return;
    const w = b[2] - b[0];
    const h = b[3] - b[1];
    // Epsilon guard: onSync fires on every layout; identical dims must not
    // re-render or we ping-pong with React forever.
    setTextSize((cur) => (Math.abs(cur.w - w) < 0.01 && Math.abs(cur.h - h) < 0.01 ? cur : { w, h }));
  };

  const dotSpan = dotColor ? DOT_RADIUS * 2 + DOT_GAP : 0;
  const plateW = textSize.w + dotSpan + PAD_X * 2;
  const plateH = Math.max(textSize.h + PAD_Y * 2, fontSize + PAD_Y * 2);
  // With a dot, content is [dot][gap][text] centered as a block: the text
  // block's center shifts right by half the dot span, the dot sits at the
  // block's left edge.
  const textX = dotSpan / 2;
  const dotX = -plateW / 2 + PAD_X + DOT_RADIUS;

  return (
    <Billboard position={position as [number, number, number]}>
      <RoundedBox args={[plateW, plateH, 0.02]} radius={Math.min(0.12, plateH / 3)} smoothness={4}>
        <meshBasicMaterial color={PLATE_COLOR} transparent opacity={PLATE_OPACITY} />
      </RoundedBox>
      {dotColor && (
        <mesh position={[dotX, 0, 0.02]}>
          <circleGeometry args={[DOT_RADIUS, 16]} />
          <meshBasicMaterial color={dotColor} />
        </mesh>
      )}
      <Suspense fallback={null}>
        <Text
          fontSize={fontSize}
          color={textColor}
          anchorX="center"
          anchorY="middle"
          position={[textX, 0, 0.02]}
          onSync={onSync}
        >
          {text}
        </Text>
      </Suspense>
    </Billboard>
  );
}

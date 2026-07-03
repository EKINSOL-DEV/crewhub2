// Measured text bubble (live-feedback fix): SpeechBubble and ThoughtBubble
// shipped with fixed-size backdrops, so wrapped text overflowed the rounded
// box. This shared billboard measures the laid-out text via troika's
// onSync metrics and sizes the backdrop to fit with real padding.
// Caller MUST wrap this in its own <Suspense fallback={null}> — drei's Text
// suspends on troika font preload (M1 lesson).
import { useState } from "react";
import { Billboard, RoundedBox, Text } from "@react-three/drei";

const PAD_X = 0.3;
const PAD_Y = 0.24;

export interface TextBubbleProps {
  y: number;
  text: string;
  fontSize: number;
  color: string;
  maxWidth: number;
  opacity: number;
  /** Minimum backdrop size so one-word bubbles still read as bubbles. */
  minWidth?: number;
  minHeight?: number;
  /** Extra decorations rendered inside the billboard (e.g. cloud-tail dots). */
  children?: React.ReactNode;
}

interface TroikaSync {
  textRenderInfo?: { blockBounds: [number, number, number, number] };
}

export function TextBubble(props: TextBubbleProps) {
  const { y, text, fontSize, color, maxWidth, opacity, minWidth = 1.2, minHeight = 0.6 } = props;
  const [dims, setDims] = useState({ w: minWidth, h: minHeight });

  const onSync = (troika: TroikaSync) => {
    const b = troika.textRenderInfo?.blockBounds;
    if (!b) return;
    const w = Math.max(minWidth, b[2] - b[0] + PAD_X * 2);
    const h = Math.max(minHeight, b[3] - b[1] + PAD_Y * 2);
    // Epsilon guard: onSync fires on every layout; identical dims must not
    // re-render or we ping-pong with React forever.
    setDims((cur) => (Math.abs(cur.w - w) < 0.01 && Math.abs(cur.h - h) < 0.01 ? cur : { w, h }));
  };

  return (
    <Billboard position={[0, y, 0]}>
      <RoundedBox args={[dims.w, dims.h, 0.02]} radius={0.14} smoothness={4}>
        <meshBasicMaterial color="#ffffff" transparent opacity={opacity} />
      </RoundedBox>
      {props.children}
      <Text
        fontSize={fontSize}
        color={color}
        anchorX="center"
        anchorY="middle"
        maxWidth={maxWidth}
        position={[0, 0, 0.02]}
        onSync={onSync}
      >
        {text}
      </Text>
    </Billboard>
  );
}

// Speech bubble (M2 T2): a bot's latest AssistantText, floating above its
// head. Caller MUST wrap this in its own <Suspense fallback={null}> — drei's
// Text suspends on troika font preload (M1 lesson), and a stalled font must
// never hide the robot underneath.
import { Billboard, RoundedBox, Text } from "@react-three/drei";

const BUBBLE_Y = 2.7;
// Fixed size — dynamic text measurement isn't worth it for M2; long lines
// wrap/clip inside maxWidth instead.
const BUBBLE_W = 3.8;
const BUBBLE_H = 0.9;

export function SpeechBubble({ text }: { text: string }) {
  return (
    <Billboard position={[0, BUBBLE_Y, 0]}>
      <RoundedBox args={[BUBBLE_W, BUBBLE_H, 0.02]} radius={0.12} smoothness={4}>
        <meshBasicMaterial color="#ffffff" transparent opacity={0.92} />
      </RoundedBox>
      <Text
        fontSize={0.24}
        color="#1f2430"
        anchorX="center"
        anchorY="middle"
        maxWidth={3.4}
        position={[0, 0, 0.02]}
      >
        {text}
      </Text>
    </Billboard>
  );
}

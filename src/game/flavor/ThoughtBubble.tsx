// Thought bubble (M4 T2): a bot's throttled "flavor" thought, floating above
// its head — cloud-styled to read as internal monologue, distinct from
// chat's SpeechBubble. Caller MUST wrap this in its own
// <Suspense fallback={null}> — drei's Text suspends on troika font preload
// (M1 lesson), and a stalled font must never hide the robot underneath.
import { Billboard, RoundedBox, Text } from "@react-three/drei";

const BUBBLE_Y = 3.15; // above SpeechBubble's 2.7 so the two never overlap
const BUBBLE_W = 3.4;
const BUBBLE_H = 0.8;
const OPACITY = 0.88;

export function ThoughtBubble({ text }: { text: string }) {
  return (
    <Billboard position={[0, BUBBLE_Y, 0]}>
      <RoundedBox args={[BUBBLE_W, BUBBLE_H, 0.02]} radius={0.14} smoothness={4}>
        <meshBasicMaterial color="#ffffff" transparent opacity={OPACITY} />
      </RoundedBox>
      {/* Cloud tail: two shrinking dots trailing down-left, toward the head. */}
      <mesh position={[-0.9, -0.55, 0.01]}>
        <sphereGeometry args={[0.09, 8, 8]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={OPACITY} />
      </mesh>
      <mesh position={[-1.15, -0.78, 0.01]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={OPACITY} />
      </mesh>
      <Text
        fontSize={0.22}
        color="#4a5266"
        anchorX="center"
        anchorY="middle"
        maxWidth={3}
        position={[0, 0, 0.02]}
      >
        {`💭 ${text}`}
      </Text>
    </Billboard>
  );
}

// Thought bubble (M4 T2): a bot's throttled "flavor" thought, floating above
// its head — cloud-styled to read as internal monologue, distinct from
// chat's SpeechBubble. Backdrop is measured to the wrapped text
// (live-feedback fix — the original fixed 3.4x0.8 box clipped three-line
// thoughts). Caller MUST wrap this in its own <Suspense fallback={null}> —
// drei's Text suspends on troika font preload (M1 lesson).
import { TextBubble } from "@/game/engine/TextBubble";

const BUBBLE_Y = 3.15; // above SpeechBubble's 2.7 so the two never overlap
const OPACITY = 0.88;

export function ThoughtBubble({ text }: { text: string }) {
  return (
    <TextBubble
      y={BUBBLE_Y}
      text={`💭 ${text}`}
      fontSize={0.22}
      color="#4a5266"
      maxWidth={3}
      opacity={OPACITY}
    >
      {/* Cloud tail: two shrinking dots trailing down-left, toward the head. */}
      <mesh position={[-0.9, -0.75, 0.01]}>
        <sphereGeometry args={[0.09, 8, 8]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={OPACITY} />
      </mesh>
      <mesh position={[-1.15, -0.98, 0.01]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={OPACITY} />
      </mesh>
    </TextBubble>
  );
}

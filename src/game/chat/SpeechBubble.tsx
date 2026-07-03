// Speech bubble (M2 T2): a bot's latest AssistantText, floating above its
// head. Backdrop is measured to the wrapped text (live-feedback fix — the
// original fixed 3.8x0.9 box clipped multi-line replies). Caller MUST wrap
// this in its own <Suspense fallback={null}> — drei's Text suspends on
// troika font preload (M1 lesson), and a stalled font must never hide the
// robot underneath.
import { TextBubble } from "@/game/engine/TextBubble";

const BUBBLE_Y = 2.7;

export function SpeechBubble({ text }: { text: string }) {
  return (
    <TextBubble y={BUBBLE_Y} text={text} fontSize={0.24} color="#1f2430" maxWidth={3.4} opacity={0.92} />
  );
}

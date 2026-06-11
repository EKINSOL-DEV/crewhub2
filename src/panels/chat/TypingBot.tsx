// Typing Bot (D-M2-6): while status == Working with no streaming text yet —
// animated ●●● with the agent's emoji avatar; static under reduced motion.
import "./chat.css";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/components/use-reduced-motion";

export function TypingBot({ emoji = "🤖" }: { emoji?: string }) {
  const reduced = usePrefersReducedMotion();
  return (
    <div data-testid="typing-bot" className="flex items-center gap-2 px-4 py-1.5 text-muted-foreground">
      <span aria-hidden="true">{emoji}</span>
      <span className={cn("ch-typing", !reduced && "ch-typing--live")} role="status" aria-label="working">
        <span className="ch-dot" />
        <span className="ch-dot" />
        <span className="ch-dot" />
      </span>
    </div>
  );
}

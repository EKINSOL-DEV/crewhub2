// Confetti Hire (T19, D-M2-6): 1 s CSS confetti when an agent is hired.
// Renders nothing at all under prefers-reduced-motion.
import { useEffect } from "react";
import type React from "react";
import { usePrefersReducedMotion } from "@/components/use-reduced-motion";
import "./confetti.css";

const COLORS = ["#f87171", "#fbbf24", "#34d399", "#60a5fa", "#c084fc", "#f472b6"];

export function ConfettiBurst({ count = 18, onDone }: { count?: number; onDone?: () => void }) {
  const reduced = usePrefersReducedMotion();
  useEffect(() => {
    const t = setTimeout(() => onDone?.(), reduced ? 0 : 1100);
    return () => clearTimeout(t);
  }, [reduced, onDone]);
  if (reduced) return null;
  return (
    <div className="confetti-burst" aria-hidden data-testid="confetti">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={
            {
              left: `${Math.round((i / count) * 100)}%`,
              backgroundColor: COLORS[i % COLORS.length],
              animationDelay: `${(i % 5) * 40}ms`,
              "--dx": `${(i % 7) - 3}rem`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

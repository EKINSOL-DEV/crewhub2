// Status Critters (D-M2-6) — shared seed, Lane A owns post-merge.
import "./critters.css";
import type { SessionStatus } from "@/ipc/bindings";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "./use-reduced-motion";

export interface Critter {
  emoji: string;
  label: string;
  anim?: "wiggle" | "bounce";
}

export const STATUS_CRITTERS: Record<SessionStatus, Critter> = {
  Working: { emoji: "🔨", label: "working", anim: "wiggle" },
  WaitingForInput: { emoji: "💬", label: "waiting for input" },
  WaitingForPermission: { emoji: "🙋", label: "waiting for permission", anim: "bounce" },
  Idle: { emoji: "😴", label: "idle" },
  Ended: { emoji: "🪦", label: "ended" },
};

export function StatusEmoji({ status, className }: { status: SessionStatus; className?: string }) {
  const reduced = usePrefersReducedMotion();
  const critter = STATUS_CRITTERS[status];
  return (
    <span
      data-testid="status-emoji"
      data-status={status}
      role="img"
      title={critter.label}
      aria-label={critter.label}
      className={cn(!reduced && critter.anim ? `ch-anim-${critter.anim}` : undefined, className)}
    >
      {critter.emoji}
    </span>
  );
}

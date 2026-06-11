// Status → glow mapping (EKI-66): the 3D twin of StatusEmoji's critters
// (src/components/StatusEmoji.tsx). Same semantics, expressed as light:
// Working pulses green, WaitingForPermission bounces orange ("look at me"),
// waiting-for-input holds steady, idle dims, ended is ash.
import type { SessionStatus } from "@/ipc/bindings";

export type GlowAnim = "pulse" | "bounce" | "none";

export interface StatusGlow {
  color: string;
  /** Emissive strength 0..1 — idle/ended bots glow dimmer than active ones. */
  intensity: number;
  anim: GlowAnim;
  label: string;
}

export const STATUS_GLOWS: Record<SessionStatus, StatusGlow> = {
  Working: { color: "#4ade80", intensity: 1, anim: "pulse", label: "working" },
  WaitingForInput: { color: "#facc15", intensity: 0.85, anim: "none", label: "waiting for input" },
  WaitingForPermission: { color: "#fb923c", intensity: 1, anim: "bounce", label: "waiting for permission" },
  Idle: { color: "#60a5fa", intensity: 0.4, anim: "none", label: "idle" },
  Ended: { color: "#9ca3af", intensity: 0.15, anim: "none", label: "ended" },
};

export function statusGlow(status: SessionStatus): StatusGlow {
  return STATUS_GLOWS[status];
}

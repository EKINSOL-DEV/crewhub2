// Status Critters (D-M2-6) — shared seed, owned by Lane A after merge.
// Working 🔨 wiggles, WaitingForPermission 🙋 bounces ("look at me"); all
// animation is CSS-only and disabled under prefers-reduced-motion.
import type { SessionStatus } from "@/ipc/bindings";
import "./status-emoji.css";

export const STATUS_CRITTERS: Record<SessionStatus, string> = {
  Working: "🔨",
  WaitingForInput: "💬",
  WaitingForPermission: "🙋",
  Idle: "😴",
  Ended: "🪦",
};

const CRITTER_MOTION: Partial<Record<SessionStatus, string>> = {
  Working: "critter-wiggle",
  WaitingForPermission: "critter-bounce",
};

export function statusCritter(status: SessionStatus): string {
  return STATUS_CRITTERS[status];
}

/** Tool Chips (D-M2-6): per-tool emoji, shared by chat tool cards and the activity feed. */
export function toolEmoji(tool: string): string {
  if (tool.startsWith("mcp__crewhub")) return "🏠";
  switch (tool) {
    case "Read":
      return "📖";
    case "Edit":
    case "Write":
      return "✏️";
    case "Bash":
      return "💻";
    case "Grep":
    case "Glob":
      return "🔎";
    case "WebFetch":
      return "🌐";
    default:
      return "🛠️";
  }
}

export function StatusEmoji({ status, title }: { status: SessionStatus; title?: string }) {
  return (
    <span
      data-testid="status-emoji"
      data-status={status}
      title={title ?? status}
      className={`inline-block ${CRITTER_MOTION[status] ?? ""}`}
      role="img"
      aria-label={status}
    >
      {STATUS_CRITTERS[status]}
    </span>
  );
}

import { useState } from "react";
import { useChatContext } from "../context";
import type { ItemProps } from "./types";

/** Dim single-line system note (D-M2-5). */
export function SystemRow({ item }: ItemProps) {
  if (item.kind !== "SystemNote") return null;
  return (
    <div
      className="truncate px-3 py-0.5 text-xs text-muted-foreground"
      title={item.data.text}
      data-testid="system-row"
    >
      {item.data.text}
    </div>
  );
}

/** "🤷 unsupported item" — format drift never crashes the panel (M1 contract). */
export function UnknownRow({ item }: ItemProps) {
  if (item.kind !== "Unknown") return null;
  return (
    <div className="px-3 py-0.5 text-xs text-muted-foreground" data-testid="unknown-row">
      🤷 unsupported item ({item.data.raw_type})
    </div>
  );
}

/**
 * Image marker: the engine surfaces media_type only in M2 (plan §2 G8 note) —
 * no bytes cross the IPC, so this renders a placeholder, not a thumbnail.
 */
export function ImageItem({ item }: ItemProps) {
  if (item.kind !== "Image") return null;
  return (
    <div className="px-3 py-1" data-testid="image-item">
      <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card/60 px-3 py-2 text-xs text-muted-foreground">
        🖼️ image <span className="font-mono">{item.data.media_type}</span>
      </div>
    </div>
  );
}

/**
 * Checkpoint timeline marker (EKI-64): subtle line; hover/focus reveals
 * "Rewind to here" → confirm → fork-from-checkpoint via the chat context.
 */
export function CheckpointMarker({ item }: ItemProps) {
  const ctx = useChatContext();
  const [confirming, setConfirming] = useState(false);
  if (item.kind !== "Checkpoint") return null;
  const canRewind = ctx?.rewindTo !== undefined;
  return (
    <div className="group flex items-center gap-2 px-3 py-1" data-testid="checkpoint-marker">
      <div className="h-px flex-1 bg-border" />
      <span className="text-[10px] text-muted-foreground">📍 checkpoint</span>
      {canRewind && !confirming && (
        <button
          type="button"
          data-testid="checkpoint-rewind"
          className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus:opacity-100 group-hover:opacity-100"
          onClick={() => setConfirming(true)}
        >
          ⏪ Rewind to here
        </button>
      )}
      {canRewind && confirming && (
        <span className="flex items-center gap-1 text-[10px]" data-testid="checkpoint-confirm">
          <span className="text-muted-foreground">fork a new session from this checkpoint?</span>
          <button
            type="button"
            data-testid="checkpoint-confirm-yes"
            className="rounded border border-border px-1.5 py-0.5 hover:bg-accent/20"
            onClick={() => {
              setConfirming(false);
              ctx?.rewindTo?.(item.data.id);
            }}
          >
            Rewind
          </button>
          <button
            type="button"
            className="rounded border border-border px-1.5 py-0.5 text-muted-foreground"
            onClick={() => setConfirming(false)}
          >
            Cancel
          </button>
        </span>
      )}
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

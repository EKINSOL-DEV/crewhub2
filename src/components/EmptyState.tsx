// Quiet Office empty states (D-M2-6) — shared seed, owned by Lane A after merge.
import type React from "react";

export function EmptyState({
  emoji,
  title,
  hint,
  action,
}: {
  emoji: string;
  title: string;
  hint: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      data-testid="empty-state"
      className="flex h-full min-h-32 flex-col items-center justify-center gap-2 p-6 text-center"
    >
      <span className="text-4xl" aria-hidden>
        {emoji}
      </span>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-64 text-xs text-muted-foreground">{hint}</p>
      {action}
    </div>
  );
}

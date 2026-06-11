// Quiet Office empty states (D-M2-6) — shared seed, Lane A owns post-merge.

export interface EmptyStateProps {
  emoji: string;
  title: string;
  hint: string;
}

export function EmptyState({ emoji, title, hint }: EmptyStateProps) {
  return (
    <div
      data-testid="empty-state"
      className="flex h-full min-h-32 flex-col items-center justify-center gap-2 p-8 text-center"
    >
      <div className="text-4xl" aria-hidden="true">
        {emoji}
      </div>
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}

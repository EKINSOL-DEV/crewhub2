// Shared "Quiet Office" empty state (D-M2-6): every panel gets a friendly face.
export interface EmptyStateProps {
  emoji: string;
  title: string;
  hint: string;
  action?: React.ReactNode;
}

export function EmptyState({ emoji, title, hint, action }: EmptyStateProps) {
  return (
    <div
      data-testid="empty-state"
      className="flex h-full min-h-32 flex-col items-center justify-center gap-2 p-6 text-center"
    >
      <span aria-hidden className="text-4xl">
        {emoji}
      </span>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-60 text-xs text-muted-foreground">{hint}</p>
      {action}
    </div>
  );
}

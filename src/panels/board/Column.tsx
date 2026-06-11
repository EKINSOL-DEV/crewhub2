// One board column (T10, EKI-93). The blocked column header flares when
// non-empty (v1's loud-blocked lesson: blocked is a real column here, but it
// announces itself). Quiet Board whispers when the whole board is empty.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { STATUS_CONFIG, type TaskStatus } from "./task-constants";

export interface ColumnProps {
  status: TaskStatus;
  count: number;
  /** True when the entire (filtered) board is empty — show the whisper. */
  boardEmpty: boolean;
  children: ReactNode;
}

export function Column({ status, count, boardEmpty, children }: ColumnProps) {
  const cfg = STATUS_CONFIG[status];
  const flare = status === "blocked" && count > 0;
  return (
    <section
      data-testid={`board-column-${status}`}
      aria-label={`${cfg.label} (${count})`}
      className="flex h-full w-52 shrink-0 flex-col rounded-md bg-muted/40"
    >
      <header
        className={cn(
          "flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium",
          flare && "ch-blocked-flare text-destructive",
        )}
        data-testid={flare ? "blocked-flare" : undefined}
      >
        <span aria-hidden>{cfg.emoji}</span>
        {cfg.label}
        <span className="ml-auto rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
          {count}
        </span>
      </header>
      <div className="flex min-h-8 flex-1 flex-col gap-1.5 overflow-y-auto p-1.5">
        {children}
        {boardEmpty && (
          <p data-testid={`whisper-${status}`} className="px-1 text-[10px] italic text-muted-foreground">
            {cfg.whisper}
          </p>
        )}
      </div>
    </section>
  );
}

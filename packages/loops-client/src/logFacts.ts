/**
 * Facts the event log holds that no read model carries (CL-312): the open quiet stretches (`ticket.quiet`) and the
 * latest automation runs (`automation.ran`). A snapshot is assembled from reads, so a tab opened after the quiet job
 * spoke would show no dust and no card; the host (and the demo, for its own snapshot) pick these rows from the log
 * and hand them with the snapshot, bounded to open tickets. The picking is here so the host and the demo agree.
 */
import type { BoardResponse, Envelope, TicketStatus } from "./types.ts";

/** The two types read from the log, as `GET /api/events?types=` takes them. */
export const LOG_FACT_TYPES = "ticket.quiet,automation.ran";
/** The open tickets the facts are bounded to: where a package can gather dust or a run's card is worth a word. */
export const LOG_FACT_STATUSES: readonly TicketStatus[] = ["planned", "in_progress", "review"];
/**
 * The ticket and comment events a person or an agent writes: the ticket's activity, which ends a quiet stretch (the
 * model's rule, after loops' `people_activity`: rows by `system` do not count). `ticket.quiet`, `ticket.stalled` and
 * `ticket.resumed` are the system's and are not asked for.
 */
export const ACTIVITY_TYPES = [
  "ticket.created",
  "ticket.updated",
  "ticket.moved",
  "ticket.archived",
  "ticket.unarchived",
  "ticket.progress",
  "comment.created",
  "comment.updated",
  "comment.deleted",
] as const;
export const ACTIVITY_TYPES_QUERY = ACTIVITY_TYPES.join(",");
/** How many runs a snapshot carries at most, the newest (the model keeps as many lines). */
export const LOG_RUNS_KEPT = 24;

export interface OpenTicket {
  id: string;
  key: string;
  slug: string;
  status: TicketStatus;
}

/** The open tickets of the boards just read, by ticket id: planned, in progress and in review. */
export function openTicketsOf(boards: Record<string, BoardResponse>): Map<string, OpenTicket> {
  const open = new Map<string, OpenTicket>();
  for (const [slug, board] of Object.entries(boards))
    for (const column of board.columns)
      if (LOG_FACT_STATUSES.includes(column.status)) for (const t of column.tickets) open.set(t.id, { id: t.id, key: t.key, slug, status: column.status });
  return open;
}

export interface LogFacts {
  /** The open quiet stretches, one per ticket (the newest), oldest first. */
  quiet: Envelope[];
  /** The latest automation runs on open tickets, oldest first. */
  automationRuns: Envelope[];
}

/** The quiet rows that could be a fact now: on an open ticket, in the status the quiet job saw; the newest per ticket. */
export function quietCandidates(rows: Envelope[], open: Map<string, OpenTicket>): Envelope[] {
  const newest = new Map<string, Envelope>();
  for (const row of rows) {
    if (row.type !== "ticket.quiet" || !row.ticket) continue;
    const ticket = open.get(row.ticket.id);
    if (!ticket || ticket.status !== row.payload["status"]) continue;
    const seen = newest.get(row.ticket.id);
    if (!seen || seen.seq < row.seq) newest.set(row.ticket.id, row);
  }
  return [...newest.values()].sort((a, b) => a.seq - b.seq);
}

/**
 * Picks the facts. `rows`: `ticket.quiet` and `automation.ran` envelopes from the log, any order. `activity`: the
 * activity envelopes read from the oldest candidate's seq on; `activityComplete` says that read reached the log's end,
 * else no quiet is kept (a stretch that may have ended is never shown; the stream brings the next one). A quiet is
 * kept when no person or agent touched the ticket after it. Runs: on open tickets, the last `LOG_RUNS_KEPT`.
 */
export function selectLogFacts(rows: Envelope[], activity: Envelope[], open: Map<string, OpenTicket>, activityComplete: boolean): LogFacts {
  const quiet = activityComplete
    ? quietCandidates(rows, open).filter((q) => !activity.some((a) => a.ticket?.id === q.ticket?.id && a.seq > q.seq && a.actor.kind !== "system"))
    : [];
  const automationRuns = rows
    .filter((row) => row.type === "automation.ran" && row.ticket !== null && open.has(row.ticket.id))
    .sort((a, b) => a.seq - b.seq)
    .slice(-LOG_RUNS_KEPT);
  return { quiet, automationRuns };
}

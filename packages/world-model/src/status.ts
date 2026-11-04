/**
 * Ticket statuses newer than this build (round 48, r48-model M7). The validators let a new status through with one
 * warning, as they do a new kind; the world draws such a ticket with the backlog (in the storage room), counts it there,
 * and says the status as loops sent it, so nothing reads `undefined` or `NaN`.
 */
import { TICKET_STATUSES, type TicketStatus } from "@crewhub/loops-client";

const known = (status: string): status is TicketStatus => (TICKET_STATUSES as readonly string[]).includes(status);

/** The status the world draws and counts: a known one as it is, a new one as the backlog. */
export function drawnStatus(status: string): TicketStatus {
  return known(status) ? status : "backlog";
}

/** The pair every ticket carries: the status as drawn, and loops' word for a status newer than this build (null for a known one). */
export function drawn(status: string): { status: TicketStatus; newStatus: string | null } {
  return known(status) ? { status, newStatus: null } : { status: "backlog", newStatus: status };
}

const WORDS: Record<TicketStatus, string> = {
  backlog: "backlog",
  planned: "planned",
  in_progress: "in progress",
  review: "review",
  done: "done",
};

/** A status in words: a known one as the world says it ("in progress"), a new one as loops sent it. */
export function statusWords(status: string): string {
  return known(status) ? WORDS[status] : status;
}

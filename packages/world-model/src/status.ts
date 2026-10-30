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

/** The status as loops sent it when this build does not know it; null for a known one. */
export function newStatusWord(status: string): string | null {
  return known(status) ? null : status;
}

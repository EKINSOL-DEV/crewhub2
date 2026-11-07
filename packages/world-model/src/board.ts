/**
 * The board by the front door (spec addendum "the new loops events in the town"): every `automation.ran` pins a
 * small card for a few seconds, the cards queue behind each other, and the text view keeps the last few runs as
 * lines. All in source time, like a drone flight; nothing here moves a ticket or an agent.
 */
import type { AutomationRunFact } from "./facts.ts";
import type { BoardCard } from "./model.ts";

/** How long a card stays pinned, source ms. */
export const BOARD_CARD_MS = 8000;
/** The runs the board queues at most: older ones are dropped, the text view still has them. */
export const BOARD_QUEUE_MAX = 4;
/** How many runs the text view keeps per building. */
export const BOARD_LINES = 3;

/** The cards still to show at `now`: each pinned from its run's time or the end of the card before it. */
export function boardOf(runs: AutomationRunFact[], now: number): BoardCard[] {
  const cards: BoardCard[] = [];
  let until = 0;
  for (const run of runs.slice(-BOARD_QUEUE_MAX)) {
    const from = Math.max(run.ts, until);
    until = from + BOARD_CARD_MS;
    if (until <= now) continue;
    cards.push({ runId: run.runId, ticketKey: run.ticketKey, automationId: run.automationId, name: run.name, outcome: run.outcome, changed: run.changed, from, until });
  }
  return cards;
}

/** The card pinned right now, if any (the first whose time has come). */
export function pinnedCard(board: BoardCard[], now: number): BoardCard | null {
  return board.find((card) => card.from <= now && card.until > now) ?? null;
}

/** An outcome in words: loops says `ok`, `partial` or `failed`; a newer word is said as it is. */
export function outcomeWords(outcome: string): string {
  return outcome === "ok" ? "done" : outcome === "partial" ? "partly done" : outcome === "failed" ? "failed" : outcome;
}

/** "2 h", "1 h 30 min", "45 min": a quiet stretch in words, from the event's minutes. */
export function quietWords(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

/** `Automation "Label stale bugs" ran on CR-12: done; labels changed by the automation`: a run in words. */
export function runWords(run: { name: string | null; automationId: string; ticketKey: string | null; outcome: string; changed: string[] | null }): string {
  const name = run.name === null ? `Automation ${run.automationId}` : `Automation "${run.name}"`;
  const on = run.ticketKey === null ? "" : ` on ${run.ticketKey}`;
  const changed = run.changed && run.changed.length > 0 ? `; ${run.changed.map((c) => c.replace(/_/g, " ")).join(", ")} changed by the automation` : "";
  return `${name} ran${on}: ${outcomeWords(run.outcome)}${changed}`;
}

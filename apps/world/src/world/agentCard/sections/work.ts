/* "Work": the ticket on the agent's desk (or assigned to it), its status, who it waits on, its stall; then (round 22)
   every open ticket loops assigns to it ("Holds": a count by status, the list with whom each waits on), the open
   tickets of others that wait on it ("Waited on by"), and the agent's last progress line: the newest the page saw,
   else the last line of the desk ticket read once from the source (`CardContext.fetchedProgress`). Always applies
   since round 22: an agent with no ticket says so in loops' own terms, and a missing line is said to be missing. */
import type { TicketBrief } from "@crewhub/world-model";
import { agoWords, STATUS_WORDS, ticketHref } from "../words.ts";
import type { AgentCardSection, CardChip, CardRow, TicketItem } from "../types.ts";

/** How many held tickets the list shows beyond the one on the desk, and how many of the ones that wait on it. */
export const HELD_ON_CARD = 5;
export const WAITED_ON_CARD = 3;

/** "review, waits on Nicky" / "in progress, waits on a person" / "planned" */
function statusMeta(t: TicketBrief): string {
  const waits = t.waitsOn ? `waits on ${t.waitsOn.displayName}` : t.waitingOnHuman ? "waits on a person" : null;
  return waits ? `${STATUS_WORDS[t.status]}, ${waits}` : STATUS_WORDS[t.status];
}

/** "4 open tickets: 2 in progress, 1 in review, 1 planned; 2 wait on Nicky" (the count by status, then whom they wait on). */
export function holdsWords(held: readonly TicketBrief[]): string {
  const counts = new Map<string, number>();
  for (const t of held) counts.set(STATUS_WORDS[t.status], (counts.get(STATUS_WORDS[t.status]) ?? 0) + 1);
  const waits = new Map<string, number>();
  for (const t of held) {
    const who = t.waitsOn?.displayName ?? (t.waitingOnHuman ? "a person" : null);
    if (who) waits.set(who, (waits.get(who) ?? 0) + 1);
  }
  const byStatus = [...counts].map(([word, n]) => `${n} ${word}`).join(", ");
  const waiting = [...waits].map(([who, n]) => `${n} ${n === 1 ? "waits" : "wait"} on ${who}`).join(", ");
  return `${held.length} open ${held.length === 1 ? "ticket" : "tickets"}: ${byStatus}${waiting ? `; ${waiting}` : "; none waits on anyone"}`;
}

const item = (t: TicketBrief, loopsUrl: string | null, meta: string): TicketItem => ({ key: t.key, title: t.title, href: ticketHref(loopsUrl, t.key), meta });

export const workSection: AgentCardSection = {
  id: "work",
  title: "Work",
  when: () => true,
  render(facts, ctx) {
    const rows: CardRow[] = [];
    const work = facts.work;
    if (work) {
      rows.push({ kind: "ticket", ticketKey: work.key, title: work.title, href: ticketHref(ctx.loopsUrl, work.key) });
      const chips: CardChip[] = [{ kind: "status", status: work.status, label: work.rejected ? "turned down" : STATUS_WORDS[work.status] }];
      if (work.priorityTag) chips.push({ kind: "attention", text: `${work.priorityTag} priority` });
      if (work.blocked) chips.push({ kind: "plain", text: "blocked" });
      if (work.sealed) chips.push({ kind: "plain", text: "held" });
      if (work.nameTag || work.waitingOnHuman) chips.push({ kind: "plain", text: `waiting on ${work.nameTag ?? "a person"}`, icon: "message" });
      if (work.stall) chips.push({ kind: "stalled", text: work.stall.state === "stalled" ? `stalled, quiet ${work.stall.quietMinutes ?? "?"} min${work.stall.nudges ? `, nudged ${work.stall.nudges}×` : ""}` : "needs attention" });
      rows.push({ kind: "chips", chips });
      if (work.deskInferred) rows.push({ kind: "text", label: "", text: "On this desk because the status line names it: an inference.", muted: true });
      if (work.milestone) rows.push({ kind: "text", label: "Milestone", text: `${work.milestone.key} ${work.milestone.title}` });
      if (facts.workProject) rows.push({ kind: "text", label: "Project", text: `${facts.workProject.name} (${facts.workProject.key})` });
    }
    // Holds (round 22): every open ticket loops assigns to it, the one on the desk not listed twice.
    const held = facts.tickets.held;
    if (held.length) {
      rows.push({ kind: "text", label: "Holds", text: holdsWords(held) });
      const others = held.filter((t) => t.key !== work?.key);
      if (others.length) rows.push({ kind: "tickets", items: others.slice(0, HELD_ON_CARD).map((t) => item(t, ctx.loopsUrl, statusMeta(t))), more: Math.max(0, others.length - HELD_ON_CARD) });
    } else if (facts.registered) rows.push({ kind: "text", label: "Holds", text: "no ticket: crewhub-loops assigns it none right now", muted: true });
    else rows.push({ kind: "text", label: "Holds", text: `no ticket of its own: crewhub-loops assigns tickets to its lead${facts.lead ? `, ${facts.lead.displayName}` : ""}${work ? "; the one on its desk is inferred from its status line" : ""}`, muted: true });
    const waited = facts.tickets.waitedOnBy;
    if (waited.length) {
      rows.push({ kind: "text", label: "Waited on by", text: `${waited.length} open ${waited.length === 1 ? "ticket" : "tickets"} of others` });
      rows.push({ kind: "tickets", items: waited.slice(0, WAITED_ON_CARD).map((t) => item(t, ctx.loopsUrl, `${STATUS_WORDS[t.status]}, ${t.holder ? `${t.holder.displayName} holds it` : "unassigned"}`)), more: Math.max(0, waited.length - WAITED_ON_CARD) });
    } else if (held.length) rows.push({ kind: "text", label: "", text: "Nobody waits on it.", muted: true });
    // The last progress line: the page's newest, else the desk ticket's last line read once, else the honest words.
    if (facts.progress) rows.push({ kind: "quote", text: facts.progress.text, by: `${facts.progress.kind} on ${facts.progress.ticketKey}, ${agoWords(facts.progress.ts, ctx.now)}` });
    else {
      const fetched = ctx.fetchedProgress;
      if (fetched?.state === "line") rows.push({ kind: "quote", text: fetched.line.text, by: `${fetched.line.kind} on ${fetched.line.ticketKey}, ${agoWords(fetched.line.ts, ctx.now)}, read from the source` });
      else if (fetched?.state === "loading" && work) rows.push({ kind: "text", label: "", text: `Reading the last progress line of ${work.key}…`, muted: true });
      else if (work) rows.push({ kind: "text", label: "", text: `No progress line: none seen since this page opened, and ${work.key} has none.`, muted: true });
      else rows.push({ kind: "text", label: "", text: "No progress line: none seen since this page opened and no ticket on its desk to read one from.", muted: true });
    }
    return rows;
  },
};

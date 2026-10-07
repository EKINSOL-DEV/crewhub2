/* "Work": the ticket on the agent's desk (or assigned to it), its status, who it waits on, its stall, and the agent's
   last progress line. Applies when there is a ticket or a line. */
import { agoWords, STATUS_WORDS, ticketHref } from "../words.ts";
import type { AgentCardSection, CardChip, CardRow } from "../types.ts";

export const workSection: AgentCardSection = {
  id: "work",
  title: "Work",
  when: (facts) => facts.work !== null || facts.progress !== null,
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
    if (facts.progress) rows.push({ kind: "quote", text: facts.progress.text, by: `${facts.progress.kind} on ${facts.progress.ticketKey}, ${agoWords(facts.progress.ts, ctx.now)}` });
    return rows;
  },
};

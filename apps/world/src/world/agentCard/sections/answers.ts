/* "Answers" (round 22): what this agent last said to the person in the chat, from the page's Recent answers store
   (state/said.ts: the lines the bubbles showed, kept for the page's life, nothing longer), newest first, at most
   ANSWERS_ON_CARD. Where no answer can be known the words say why, per road (`CardContext.answersEmpty`: this key
   cannot read the chat, not signed in, the demo's dock). Applies whenever the page gives the context its answers; a
   test or a page without them draws no section. */
import type { AgentCardSection, CardRow } from "../types.ts";
import { agoWords, stampOf } from "../words.ts";

export const ANSWERS_ON_CARD = 3;

export const answersSection: AgentCardSection = {
  id: "answers",
  title: "Answers",
  when: (_facts, ctx) => ctx.answers !== undefined,
  render(facts, ctx) {
    const mine = (ctx.answers ?? []).filter((a) => a.agentId === facts.key).slice(0, ANSWERS_ON_CARD);
    if (mine.length === 0) return [{ kind: "text", label: "", text: ctx.answersEmpty ?? "No answer from it yet.", muted: true }];
    const rows: CardRow[] = [{ kind: "list", items: mine.map((a) => ({ text: a.text, meta: `${a.agentName ?? facts.displayName} said, ${agoWords(stampOf(a.at) ?? ctx.now, ctx.now)}` })) }];
    if (ctx.answersNote) rows.push({ kind: "text", label: "", text: ctx.answersNote, muted: true });
    return rows;
  },
};

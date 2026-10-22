/* "Answers" (round 22): what this agent last said to the person in the chat, from the page's Recent answers store
   (state/said.ts: the lines the bubbles showed, kept for the page's life, nothing longer), newest first, at most
   ANSWERS_ON_CARD. Where no answer can be known the words say why, per road (`CardContext.answersEmpty`: this key
   cannot read the chat, not signed in, the demo's dock). Applies whenever the page gives the context its answers; a
   test or a page without them draws no section. */
import type { AgentCardSection, CardRow } from "../types.ts";
import { agoWords, stampOf } from "../words.ts";

export const ANSWERS_ON_CARD = 3;

/**
 * "last message 2 h ago, 7 unread in the key maker's view" / "last message just now, nothing unread in the key maker's
 * view": the thread's own facts, in words. Whose unread (round 25; round 28 on loops main): loops counts `unreadCount`
 * against the caller's own read cursor (`domain/dm.py` `list_threads`), and for a VIEWER key against its MAKER's, the
 * admin who made the key (loops pull request 964, `agent_keys.made_by`: the one person whose chat the key reads). The host passes the
 * list on only where the key reads the chat, which is the viewer road, so the number is always the maker's: what
 * loops' own chat head shows that person ("Chat with <name>, <count> unread"). A plain key's own count (a cursor an
 * agent never sets) never reaches the card. Loops names the maker to nobody, so the card says "the key maker".
 */
export function threadWords(thread: { lastMessageAt: string; unreadCount: number }, now: number): string {
  const at = stampOf(thread.lastMessageAt);
  const when = at === null ? "at an unknown time" : agoWords(at, now);
  const unread = thread.unreadCount === 0 ? "nothing unread" : `${thread.unreadCount} unread`;
  return `last message ${when}, ${unread} in the key maker's view`;
}

export const answersSection: AgentCardSection = {
  id: "answers",
  title: "Answers",
  when: (_facts, ctx) => ctx.answers !== undefined,
  render(facts, ctx) {
    const rows: CardRow[] = [];
    // The thread's own facts (round 24), when the host passes them on: said first, before any answer this page saw.
    if (ctx.thread !== undefined) rows.push(ctx.thread === null ? { kind: "text", label: "Chat", text: "no thread with it yet", muted: true } : { kind: "text", label: "Chat", text: threadWords(ctx.thread, ctx.now) });
    const mine = (ctx.answers ?? []).filter((a) => a.agentId === facts.key).slice(0, ANSWERS_ON_CARD);
    if (mine.length === 0) rows.push({ kind: "text", label: "", text: ctx.answersEmpty ?? "No answer from it yet.", muted: true });
    else {
      rows.push({ kind: "list", items: mine.map((a) => ({ text: a.text, meta: `${a.agentName ?? facts.displayName} said, ${agoWords(stampOf(a.at) ?? ctx.now, ctx.now)}` })) });
      if (ctx.answersNote) rows.push({ kind: "text", label: "", text: ctx.answersNote, muted: true });
    }
    return rows;
  },
};

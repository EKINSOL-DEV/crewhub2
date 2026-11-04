/* The Recent answers list (round 16): a bubble lives SAID_MS, so a missed answer would be lost; the list keeps the last
   RECENT_ANSWERS lines the page saw (state/said.ts, the bubbles' own store), newest first, for the page's life. Shown in
   the Chat panel (above the frame, collapsible) and in the text view ("Recent answers"), each answer a button that
   opens that agent's chat: the Chat panel on `?chat=<id>` when loops' dock has a head for it, else its lead's chat by
   the card's rule of round 13 (`chatTargetOf`), the card in the demo (whose dock's scripted replies feed the same store
   since round 17, state/demoSaid.ts). The pure parts: the time, the row's words and accessible name; the empty state per
   road is the chat road's (`recentEmptyWords` in state/chatRoad, round 28). English here, as `chatWords`. */
import type { AgentCardFacts } from "@crewhub/world-model";
import { chatCardNote, chatTargetOf } from "./chatPanel.ts";
import { joinSentences, RECENT_ANSWERS, type Answer } from "./said.ts";

/** What the list is: the text view's section opens with it; the Chat panel keeps it behind "About this chat" (round 18). */
export const RECENT_NOTE = `The last ${RECENT_ANSWERS} answers this page saw, newest first; a bubble shows each for a moment, this list keeps them while the page is open and nothing longer, so an answer that came while no world page was open is not here.`;

/**
 * On the block itself (round 31, question 11): both chat roads read nothing from before the page opened, so an answer
 * that landed while no world page was open is not in the list, and without these words that reads as a bug. The
 * heading carries them after the count, muted; the empty line opens with them (`recentEmptyWords`).
 */
export const RECENT_SINCE = "since this page opened";

/** The heading's first words: "Recent answers", with the count when there are rows. */
export function recentHead(count: number): string {
  return `Recent answers${count > 0 ? ` (${count})` : ""}`;
}

/** The whole heading as a reader hears it: "Recent answers (2) since this page opened". */
export function recentTitle(count: number): string {
  return `${recentHead(count)} ${RECENT_SINCE}`;
}

/** The answer's time as loops wrote it, local, HH:MM:SS (24 h); the page's own clock when `at` does not parse. */
export function answerTime(answer: Pick<Answer, "at" | "shownAt">): string {
  const ms = Date.parse(answer.at);
  const date = new Date(Number.isNaN(ms) ? answer.shownAt : ms);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
}

/** The agent's name as the bubble shows it: loops' display name when the line carries one, else its id. */
export function answerName(answer: Pick<Answer, "agentId" | "agentName">): string {
  return answer.agentName ?? answer.agentId;
}

/** Where a tap on the answer goes: that agent's chat, its lead's (round 13), or nobody's (the panel without an agent, with why). */
export interface AnswerTarget {
  /** The agent the Chat panel opens for, or null (loops' dock has no head for the agent and lists no lead of it). */
  agent: { key: string; name: string } | null;
  /** The button's words. */
  action: string;
  /** The card's line when the chat is not the agent's own (round 13), else null. */
  note: string | null;
}

/**
 * The target by the card's rule: the agent's own chat when loops' dock has a head for it, else its lead's, else the
 * panel without an agent. With no card facts (the agent is no longer in the model) the panel opens for the agent by
 * its id and loops decides, as the bubble's tap does.
 */
export function answerTarget(answer: Pick<Answer, "agentId" | "agentName">, facts: Pick<AgentCardFacts, "key" | "displayName" | "chat"> | null): AnswerTarget {
  const name = answerName(answer);
  if (facts === null) return { agent: { key: answer.agentId, name }, action: `Chat with ${name}`, note: null };
  const target = chatTargetOf(facts);
  if (facts.chat.self) return { agent: target, action: `Chat with ${facts.displayName}`, note: null };
  return { agent: target, action: target ? `Chat with its lead ${target.name}` : "Open the chat", note: chatCardNote(facts) };
}

/** The row's accessible name: "<name> at HH:MM:SS: <line>. <action>", the sentences joined without a double full stop. */
export function answerLabel(answer: Pick<Answer, "agentId" | "agentName" | "text" | "at" | "shownAt">, action: string): string {
  return joinSentences(`${answerName(answer)} at ${answerTime(answer)}: ${answer.text}`, action);
}

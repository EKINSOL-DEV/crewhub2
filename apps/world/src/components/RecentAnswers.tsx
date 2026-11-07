/* The Recent answers list (round 16; state/recentAnswers.ts for the words, state/said.ts for the store): the last few
   agent answers this page saw, newest first, each a button that opens that agent's chat. In the Chat panel a compact,
   collapsible block above the frame (a details element, open while it has answers); in the text view a section. The
   same rows in both: the time loops wrote it, the agent, the first line (one line, the full text in the title), and
   under a row whose chat is not the agent's own (round 13) the words that say whose chat opens instead. What the list
   is (RECENT_NOTE) opens the text view's section; in the Chat panel it sits behind "About this chat" with the rest of
   the story (round 18), so the block starts with its rows. */
import { MessageCircle } from "lucide-react";
import { answerLabel, answerName, answerTime, RECENT_NOTE, type AnswerTarget } from "../state/recentAnswers";
import type { Answer } from "../state/said";

interface Props {
  answers: readonly Answer[];
  /** The empty list's words for this road (`recentEmptyWords`). */
  empty: string;
  /** Where a tap goes, by the card's rule (the App decides; the card in the demo). */
  targetOf: (answer: Answer) => AnswerTarget;
  onOpen: (answer: Answer, target: AnswerTarget) => void;
  /** A collapsible block (the Chat panel) or a section with its own heading (the text view). */
  as: "details" | "section";
}

export function RecentAnswers({ answers, empty, targetOf, onOpen, as }: Props) {
  const title = `Recent answers${answers.length > 0 ? ` (${answers.length})` : ""}`;
  const body = (
    <>
      {as === "section" && <p className="sign-muted recent-note">{RECENT_NOTE}</p>}
      {answers.length === 0 ? (
        <p className="recent-empty" data-recent="empty">
          {empty}
        </p>
      ) : (
        <ol className="recent-list" data-recent={answers.length}>
          {answers.map((a) => {
            const target = targetOf(a);
            const label = answerLabel(a, target.action);
            return (
              <li key={a.messageId}>
                <button type="button" className="recent-row" data-answer-agent={a.agentId} aria-label={label} title={target.note ? `${label} (${target.note})` : label} onClick={() => onOpen(a, target)}>
                  <time className="recent-time" dateTime={a.at}>
                    {answerTime(a)}
                  </time>
                  <span className="recent-name">{answerName(a)}</span>
                  <span className="recent-text">{a.text}</span>
                  <MessageCircle className="icon icon-sm" aria-hidden="true" />
                  {target.note && <span className="recent-lead">{target.action}</span>}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
  return as === "details" ? (
    <details className="chat-recent" open={answers.length > 0}>
      <summary>{title}</summary>
      {body}
    </details>
  ) : (
    <section className="text-section text-recent" aria-label="Recent answers">
      <h3>{title}</h3>
      {body}
    </section>
  );
}

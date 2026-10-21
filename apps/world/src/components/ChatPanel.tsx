/* The Chat panel (spec addendum "chat with the agents", road A): the chat with the agents is crewhub-loops' own web
   app, framed here, so the UI is exactly loops'. The frame carries the person's own loops session (the cookie is
   SameSite=Lax; the world and loops on 127.0.0.1 are one site); signed out, loops' own sign-in shows in the frame. The
   world handles no password; what the bubbles need is the road's story (`chatWords`, the same words as the Connection
   panel and the text view). Opened for an agent, the frame asks loops for that agent's chat
   (`?chat=<id>`, a loops of world/viewer-key cb163004 or later); an older loops ignores it, so the panel also says which
   chat head to open in loops' dock. The link to the app is always
   there, the fallback for a frame that never loads (the day loops refuses framing). A sheet at the right of the world;
   the whole screen on a phone. Not modal: Escape (with the focus outside the frame) and the close button close it, and
   the focus returns to the opener (App). Above the frame, since round 16, the Recent answers list (components/RecentAnswers):
   a missed bubble is not lost, and a row opens that agent's chat here. In one glance (round 17): two short lines above the
   list, what this is and the one thing to do on this road (`chatGlance`); the whole story (the dock, the road's words,
   `chatWordsLine`, and since round 18 what the Recent answers list is, `RECENT_NOTE`) behind an "About this chat"
   disclosure, a details element the keyboard and a screen reader reach; the list itself starts with its rows. */
import { ExternalLink, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import type { HostHealth } from "@crewhub/loops-client";
import { useT } from "../i18n";
import { CHAT_FRAME_ALLOW, CHAT_FRAME_SANDBOX, chatFrameUrl, chatGlance, chatWordsLine } from "../state/chatPanel";
import { RECENT_NOTE, type AnswerTarget } from "../state/recentAnswers";
import type { Answer } from "../state/said";
import { loopsWebUrl } from "../state/source";
import { Button, Card } from "./primitives";
import { RecentAnswers } from "./RecentAnswers";

interface Props {
  /** The agent whose chat the person asked for (from its card), or null from the chip. The frame cannot preselect it. */
  agent: { key: string; name: string } | null;
  /** The host's health, which names the loops web app (`loopsWebUrl`) and says the chat session's state (`connection.session`). */
  health: HostHealth | null;
  /** The whole screen (a phone) instead of a sheet at the right. */
  full: boolean;
  /** The Recent answers list (round 16): the answers, the empty state's words for this road, and where a row goes. */
  answers: readonly Answer[];
  recentEmpty: string;
  targetOf: (answer: Answer) => AnswerTarget;
  onAnswer: (answer: Answer, target: AnswerTarget) => void;
  onClose: () => void;
}

export function ChatPanel({ agent, health, full, answers, recentEmpty, targetOf, onAnswer, onClose }: Props) {
  const { t } = useT();
  const id = useId();
  const close = useRef<HTMLButtonElement>(null);
  // The panel takes the focus on its close button: the frame is cross-origin, so a key pressed inside it never reaches
  // the world; the person clicks into the chat when they want it.
  useEffect(() => {
    close.current?.focus();
  }, []);
  const src = chatFrameUrl(health, agent?.key ?? null);
  const app = loopsWebUrl(health);
  return (
    <Card className={`world-sheet chat-sheet${full ? " chat-sheet-full" : ""}`} role="dialog" aria-modal="false" aria-labelledby={`${id}-title`} aria-describedby={`${id}-lead`} data-agent={agent?.key}>
      <Card.Header
        title={agent ? t("world.chat.panel.titleWith", { name: agent.name }) : t("world.chat.panel.title")}
        titleId={`${id}-title`}
        action={<Button ref={close} variant="ghost" size="sm" iconOnly aria-label={t("world.chat.panel.close")} title={t("world.chat.panel.closeHint")} icon={<X className="icon" aria-hidden="true" />} onClick={onClose} />}
      />
      <Card.Body className="chat-sheet-body">
        <p className="chat-sheet-lead" id={`${id}-lead`}>
          <span className="chat-sheet-what">{agent ? t("world.chat.panel.whatWith", { name: agent.name }) : t("world.chat.panel.what")}</span>
          <span className="chat-sheet-todo">{chatGlance(health?.connection?.session)}</span>
        </p>
        <details className="chat-about">
          <summary>{t("world.chat.panel.about")}</summary>
          <p className="chat-sheet-dock">{agent ? t("world.chat.panel.leadWith", { name: agent.name }) : t("world.chat.panel.lead")}</p>
          <p className="sign-muted chat-sheet-needs">{chatWordsLine(health?.connection?.session)}</p>
          <p className="sign-muted recent-note">{RECENT_NOTE}</p>
        </details>
        <RecentAnswers as="details" answers={answers} empty={recentEmpty} targetOf={targetOf} onOpen={onAnswer} />
        <iframe className="chat-frame" src={src} title={t("world.chat.panel.frame")} sandbox={CHAT_FRAME_SANDBOX.join(" ")} allow={CHAT_FRAME_ALLOW} referrerPolicy="strict-origin-when-cross-origin" />
      </Card.Body>
      <Card.Footer className="chat-sheet-foot">
        <span className="sign-muted">{t("world.chat.panel.fallback")}</span>
        <Button size="sm" className="chat-open-app" href={app} target="_blank" rel="noreferrer" icon={<ExternalLink className="icon icon-sm" aria-hidden="true" />}>
          {t("world.chat.panel.openApp")}
          <span className="sr-only"> ({t("world.newTab")})</span>
        </Button>
      </Card.Footer>
    </Card>
  );
}

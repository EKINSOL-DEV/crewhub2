/* The agent card: what one agent is doing now, from the facts the projection holds (world/agentCard). The kit's Card
   with a portrait of the figure, then the registry's sections as rows. Beside the figure on a desktop (the scene places
   its anchor), a bottom sheet on a phone. Not modal: Escape and a tap outside close it (App), the world stays live. */
import { useEffect, useId, useRef, useState } from "react";
import { ChevronRight, Circle, CircleCheck, CircleDot, CircleEllipsis, Clock, Contrast, Eye, ExternalLink, Flag, MessageCircle, MessageSquare, TriangleAlert, X } from "lucide-react";
import { useT } from "../i18n";
import { roleWords, type AgentCardFacts, type Freshness } from "@crewhub/world-model";
import { LaneChip } from "../world/lane";
import type { CardChip, CardRow, RenderedSection } from "../world/agentCard/types";
import { chatCardNote, chatTargetOf } from "../state/chatPanel";
import { Button, Card, Chip } from "./primitives";

const STATUS_KIT = { backlog: "backlog", planned: "planned", in_progress: "progress", review: "review", done: "done" } as const;
const PLAIN_ICON = { message: MessageSquare, clock: Clock, alert: TriangleAlert, flag: Flag } as const;
/* Status icons as the kit draws them: shape first, colour second. */
const STATUS_ICON = { backlog: Circle, planned: CircleDot, in_progress: Contrast, review: CircleEllipsis, done: CircleCheck } as const;

/* The "More" disclosure (round 22) is closed at first and, once opened, stays open for every card of the page's life. */
let moreOpen = false;

interface Props {
  facts: AgentCardFacts;
  sections: RenderedSection[];
  freshness: Freshness;
  demo: boolean;
  following: boolean;
  /** A bottom sheet (phone) instead of a card beside the figure. */
  sheet: boolean;
  onFollow: () => void;
  /**
   * Opens the Chat panel for an agent (live mode: crewhub-loops' own chat, framed): this agent when loops' dock has a
   * head for it, else its lead (`state/chatPanel` `chatTargetOf`). Null in the demo, whose chat is its own dock.
   */
  onChat: ((key: string) => void) | null;
  onClose: () => void;
  /** Draws the figure's portrait onto the canvas; false when there is no figure to draw. */
  portrait: (canvas: HTMLCanvasElement) => boolean;
}

export function AgentCard({ facts, sections, freshness, demo, following, sheet, onFollow, onChat, onClose, portrait }: Props) {
  const { t } = useT();
  const id = useId();
  const canvas = useRef<HTMLCanvasElement>(null);
  const card = useRef<HTMLDivElement>(null);
  // The portrait follows the figure's pose: drawn on open and now and then after; never while the tab is hidden.
  useEffect(() => {
    const draw = () => {
      const el = canvas.current;
      if (!el || document.hidden) return;
      el.dataset.drawn = portrait(el) ? "" : undefined;
    };
    draw();
    const timer = window.setInterval(draw, 1500);
    return () => window.clearInterval(timer);
  }, [portrait, facts.key]);
  // The sheet takes the focus (it covers the scene); the card beside the figure leaves it on the canvas.
  useEffect(() => {
    if (sheet) card.current?.querySelector<HTMLElement>("button")?.focus();
  }, [sheet, facts.key]);
  const { agent } = facts;
  const role = roleWords(agent.role, agent.roleSource, "you");
  const [more, setMore] = useState(moreOpen);
  const open = sections.filter((s) => !s.more);
  const detail = sections.filter((s) => s.more);
  const section = (s: RenderedSection) => (
    <section key={s.id} className="agent-card-section" aria-labelledby={`${id}-${s.id}`}>
      <h3 className="eyebrow" id={`${id}-${s.id}`}>
        {s.title}
      </h3>
      {s.rows.map((row, i) => (
        <Row key={i} row={row} freshness={freshness} demo={demo} />
      ))}
    </section>
  );
  return (
    <Card ref={card} className={`agent-card${sheet ? " agent-card-sheet" : ""}${agent.presence === "proxy" ? " proxy" : ""}`} role="dialog" aria-modal="false" aria-labelledby={`${id}-title`}>
      <header className="agent-card-head">
        <canvas ref={canvas} className="agent-portrait" width={112} height={112} aria-hidden="true" />
        <div className="agent-card-name">
          <h2 className="card-title" id={`${id}-title`}>
            {facts.displayName}
          </h2>
          <span className="sign-muted">
            {role}
            {facts.registered ? "" : ", a worker"}
          </span>
        </div>
        <Button variant="ghost" size="sm" iconOnly aria-label={`Close the card of ${facts.displayName}`} icon={<X className="icon" aria-hidden="true" />} onClick={onClose} />
      </header>
      <Card.Body className="agent-card-body">
        {open.map(section)}
        {detail.length > 0 && (
          <details
            className="agent-card-more"
            open={more}
            onToggle={(e) => {
              moreOpen = e.currentTarget.open;
              setMore(moreOpen);
            }}
          >
            <summary className="agent-card-more-summary">
              <ChevronRight className="icon icon-sm agent-card-more-mark" aria-hidden="true" />
              <span>{more ? "Less" : "More"}</span>
              <span className="sign-muted">{detail.map((s) => s.title).join(", ")}</span>
            </summary>
            {detail.map(section)}
          </details>
        )}
      </Card.Body>
      <Card.Footer className="agent-card-foot">
        <Button size="sm" pressed={following} icon={<Eye className="icon" aria-hidden="true" />} onClick={onFollow} kbd="⇧F" title={following ? "Stop following (Shift+F or Escape)" : "The camera follows this figure wherever it walks (Shift+F)"}>
          {following ? "Following" : "Follow"}
        </Button>
        {onChat && facts.chat.self && (
          <Button size="sm" className="agent-chat" icon={<MessageCircle className="icon" aria-hidden="true" />} aria-label={t("world.chat.card", { name: facts.displayName })} title={t("world.chat.cardHint", { name: facts.displayName })} onClick={() => onChat(facts.key)}>
            Chat
          </Button>
        )}
        {demo && <span className="demo-note">Demo: scripted facts</span>}
        {onChat && !facts.chat.self && <ChatNote facts={facts} onChat={onChat} />}
      </Card.Footer>
    </Card>
  );
}

/* Loops' chat dock lists enabled agents of loops role lead only (round 13), so a card whose agent has no chat head there
   shows no "Chat with <name>" (it would pretend) and says why; when loops lists its lead, a button for the lead's chat. */
function ChatNote({ facts, onChat }: { facts: AgentCardFacts; onChat: (key: string) => void }) {
  const { t } = useT();
  const target = chatTargetOf(facts);
  return (
    <p className="agent-chat-note sign-muted" data-chat="leads-only">
      <span>{chatCardNote(facts)}</span>
      {target && (
        <Button size="sm" className="agent-chat agent-chat-lead" icon={<MessageCircle className="icon" aria-hidden="true" />} aria-label={t("world.chat.card", { name: target.name })} title={t("world.chat.cardHint", { name: target.name })} onClick={() => onChat(target.key)}>
          {t("world.chat.leadButton", { name: target.name })}
        </Button>
      )}
    </p>
  );
}

function Row({ row, freshness, demo }: { row: CardRow; freshness: Freshness; demo: boolean }) {
  switch (row.kind) {
    case "text":
      return (
        <p className={`agent-row${row.muted ? " sign-muted" : ""}`}>
          {row.label && <span className="agent-row-label">{row.label}</span>}
          <span className={row.mono ? "agent-row-mono" : undefined}>{row.text}</span>
        </p>
      );
    case "ticket":
      return (
        <p className="agent-row agent-ticket">
          {row.href ? (
            <a className="agent-ticket-link" href={row.href} target="_blank" rel="noreferrer" title={`Open ${row.ticketKey} in crewhub-loops`}>
              <span className="agent-ticket-key">{row.ticketKey}</span>
              <span className="agent-ticket-title">{row.title}</span>
              <ExternalLink className="icon icon-sm" aria-hidden="true" />
            </a>
          ) : (
            <span className="agent-ticket-link" title={demo ? "Demo: there is no crewhub-loops web app to open" : undefined}>
              <span className="agent-ticket-key">{row.ticketKey}</span>
              <span className="agent-ticket-title">{row.title}</span>
            </span>
          )}
        </p>
      );
    case "chips":
      return (
        <p className="agent-row agent-chips">
          {row.chips.map((chip, i) => (
            <ChipOf key={i} chip={chip} freshness={freshness} />
          ))}
        </p>
      );
    case "quote":
      return (
        <blockquote className="agent-quote">
          <p>{row.text}</p>
          <footer className="sign-muted">{row.by}</footer>
        </blockquote>
      );
    case "list":
      return (
        <ul className="agent-list">
          {row.items.map((item, i) => (
            <li key={i}>
              <span>{item.text}</span>
              <span className="sign-muted">{item.meta}</span>
            </li>
          ))}
        </ul>
      );
    case "tickets":
      return (
        <ul className="agent-tickets">
          {row.items.map((item) => (
            <li key={item.key}>
              {item.href ? (
                <a className="agent-ticket-link agent-ticket-small" href={item.href} target="_blank" rel="noreferrer" title={`Open ${item.key} in crewhub-loops`}>
                  <span className="agent-ticket-key">{item.key}</span>
                  <span className="agent-ticket-title">{item.title}</span>
                </a>
              ) : (
                <span className="agent-ticket-link agent-ticket-small" title={demo ? "Demo: there is no crewhub-loops web app to open" : undefined}>
                  <span className="agent-ticket-key">{item.key}</span>
                  <span className="agent-ticket-title">{item.title}</span>
                </span>
              )}
              <span className="sign-muted agent-ticket-meta">{item.meta}</span>
            </li>
          ))}
          {row.more > 0 && <li className="sign-muted">and {row.more} more</li>}
        </ul>
      );
  }
}

function ChipOf({ chip, freshness }: { chip: CardChip; freshness: Freshness }) {
  switch (chip.kind) {
    case "lane":
      return <LaneChip status={chip.status} freshness={freshness} />;
    case "status": {
      const Icon = STATUS_ICON[chip.status];
      return <Chip.Status value={STATUS_KIT[chip.status]} label={chip.label} icon={<Icon className="icon" aria-hidden="true" />} />;
    }
    case "attention":
      return <Chip.Attention>{chip.text}</Chip.Attention>;
    case "stalled":
      return <Chip.Stalled>{chip.text}</Chip.Stalled>;
    case "plain": {
      const Icon = chip.icon ? PLAIN_ICON[chip.icon] : null;
      return <Chip icon={Icon ? <Icon className="icon icon-sm" aria-hidden="true" /> : undefined}>{chip.text}</Chip>;
    }
  }
}

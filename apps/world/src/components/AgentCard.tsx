/* The agent card: what one agent is doing now, from the facts the projection holds (world/agentCard). The kit's Card
   with a portrait of the figure, then the registry's sections as rows. Beside the figure on a desktop (the scene places
   its anchor), a bottom sheet on a phone. Not modal: Escape and a tap outside close it (App), the world stays live. */
import { useEffect, useId, useRef } from "react";
import { Circle, CircleCheck, CircleDot, CircleEllipsis, Clock, Contrast, Eye, ExternalLink, Flag, MessageSquare, TriangleAlert, X } from "lucide-react";
import type { AgentCardFacts, Freshness } from "@crewhub/world-model";
import { LaneChip } from "../world/lane";
import type { CardChip, CardRow, RenderedSection } from "../world/agentCard/types";
import { Button, Card, Chip } from "./primitives";

const STATUS_KIT = { backlog: "backlog", planned: "planned", in_progress: "progress", review: "review", done: "done" } as const;
const PLAIN_ICON = { message: MessageSquare, clock: Clock, alert: TriangleAlert, flag: Flag } as const;
/* Status icons as the kit draws them: shape first, colour second. */
const STATUS_ICON = { backlog: Circle, planned: CircleDot, in_progress: Contrast, review: CircleEllipsis, done: CircleCheck } as const;

interface Props {
  facts: AgentCardFacts;
  sections: RenderedSection[];
  freshness: Freshness;
  demo: boolean;
  following: boolean;
  /** A bottom sheet (phone) instead of a card beside the figure. */
  sheet: boolean;
  onFollow: () => void;
  onClose: () => void;
  /** Draws the figure's portrait onto the canvas; false when there is no figure to draw. */
  portrait: (canvas: HTMLCanvasElement) => boolean;
}

export function AgentCard({ facts, sections, freshness, demo, following, sheet, onFollow, onClose, portrait }: Props) {
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
  const role = agent.roleSource === "override" ? `${agent.role}, set by you` : agent.roleSource === "fact" ? agent.role : `${agent.role}, from its name`;
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
        {sections.map((section) => (
          <section key={section.id} className="agent-card-section" aria-labelledby={`${id}-${section.id}`}>
            <h3 className="eyebrow" id={`${id}-${section.id}`}>
              {section.title}
            </h3>
            {section.rows.map((row, i) => (
              <Row key={i} row={row} freshness={freshness} demo={demo} />
            ))}
          </section>
        ))}
      </Card.Body>
      <Card.Footer className="agent-card-foot">
        <Button size="sm" pressed={following} icon={<Eye className="icon" aria-hidden="true" />} onClick={onFollow} kbd="⇧F" title={following ? "Stop following (Shift+F or Escape)" : "The camera follows this figure wherever it walks (Shift+F)"}>
          {following ? "Following" : "Follow"}
        </Button>
        {demo && <span className="demo-note">Demo: scripted facts</span>}
      </Card.Footer>
    </Card>
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

/* The agent card's registry contract. A section is one file under `sections/`: it says when it applies and renders
   rows from the facts. Rows are a small data vocabulary, not React, so sections stay pure and testable with node; the
   AgentCard component draws them with the kit's primitives. A row never shows a fact the facts do not have. */
import type { AgentCardFacts, Freshness, LaneStatus, RoomWording } from "@crewhub/world-model";

export interface CardContext {
  /** Source time now (ms), for "x min ago". */
  now: number;
  freshness: Freshness;
  /** The loops web app a ticket link opens in; null in demo mode (there is no web app to open). */
  loopsUrl: string | null;
  /** How places are named: the classic rooms (default) or the three halls, as the building is drawn. */
  rooms?: RoomWording;
}

export type CardRow =
  /** A labelled fact: "Project: CrewHub product". The label may be empty for a plain sentence. */
  | { kind: "text"; label: string; text: string; muted?: boolean; mono?: boolean }
  /** A ticket link: the key and the title, opening `/t/<KEY>` in loops when there is a web app. */
  | { kind: "ticket"; ticketKey: string; title: string; href: string | null }
  /** A row of small tokens: the lane chip, a status chip, "waiting on <name>", a stall. */
  | { kind: "chips"; chips: CardChip[] }
  /** The agent's own words: a progress line or the probe's context line. */
  | { kind: "quote"; text: string; by: string }
  /** A short list of facts, newest first. */
  | { kind: "list"; items: { text: string; meta: string }[] };

export type CardChip =
  | { kind: "lane"; status: LaneStatus }
  | { kind: "status"; status: "backlog" | "planned" | "in_progress" | "review" | "done"; label: string }
  | { kind: "plain"; text: string; icon?: "message" | "clock" | "alert" | "flag" }
  | { kind: "attention"; text: string }
  | { kind: "stalled"; text: string };

export interface AgentCardSection {
  id: string;
  title: string;
  /** Whether the facts hold anything this section can say; a section with nothing to say is not drawn. */
  when(facts: AgentCardFacts, ctx: CardContext): boolean;
  render(facts: AgentCardFacts, ctx: CardContext): CardRow[];
}

export interface RenderedSection {
  id: string;
  title: string;
  rows: CardRow[];
}

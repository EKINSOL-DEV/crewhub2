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
  /** The page's Recent answers (round 22; state/said.ts), every agent's, newest first; absent: no Answers section. */
  answers?: readonly CardAnswer[];
  /** The words when the agent has no answer in the list: why none can be known, per road (`cardAnswersEmpty`). */
  answersEmpty?: string;
  /** A note under the answers (what the list is), when the page wants one. */
  answersNote?: string;
  /** The desk ticket's last progress line read once from the source when the page saw none (round 22). */
  fetchedProgress?: FetchedProgress;
}

/** One answer as the card lists it: the line, who said it, when loops wrote it (ISO). */
export interface CardAnswer {
  agentId: string;
  agentName: string | null;
  text: string;
  at: string | null;
}

/** The read of the desk ticket's progress: on its way, nothing there, or the newest line. */
export type FetchedProgress = { state: "loading" } | { state: "none" } | { state: "line"; line: { ts: number; kind: string; ticketKey: string; text: string } };

/** One ticket in a compact list: the key linked into loops when there is a web app, the title, a short meta ("review, waits on Nicky"). */
export interface TicketItem {
  key: string;
  title: string;
  href: string | null;
  meta: string;
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
  | { kind: "list"; items: { text: string; meta: string }[] }
  /** A compact list of tickets (round 22), with how many more there are beyond the list. */
  | { kind: "tickets"; items: TicketItem[]; more: number };

export type CardChip =
  | { kind: "lane"; status: LaneStatus }
  | { kind: "status"; status: "backlog" | "planned" | "in_progress" | "review" | "done"; label: string }
  | { kind: "plain"; text: string; icon?: "message" | "clock" | "alert" | "flag" }
  | { kind: "attention"; text: string }
  | { kind: "stalled"; text: string };

export interface AgentCardSection {
  id: string;
  title: string;
  /** Behind the card's "More" disclosure (round 22): detail the person opens when wanted, so the card stays compact. */
  more?: boolean;
  /** Whether the facts hold anything this section can say; a section with nothing to say is not drawn. */
  when(facts: AgentCardFacts, ctx: CardContext): boolean;
  render(facts: AgentCardFacts, ctx: CardContext): CardRow[];
}

export interface RenderedSection {
  id: string;
  title: string;
  more: boolean;
  rows: CardRow[];
}

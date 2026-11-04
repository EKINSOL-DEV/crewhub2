/**
 * An agent's appearance: the one module that turns a placement into what every surface shows of it. The figure and
 * its desk lamp (the scene), the name pill's dot and words, the status tag, the bubble, the lane chip, and the
 * sentences of the text view and the jump list all read it, so they cannot disagree.
 *
 * Its interface is four reads, by what the caller has:
 * - `figureLook(agent, desk, into)`: the scene's read (no model needed; allocation-free with `into`, asked every frame);
 * - `agentLook(agent, view, workingIn)`: the labels' read (the pill, the tag, the bubble; needs the model's freshness
 *   and clock);
 * - `agentWords(agent)`: the sentences of the text view, the agent card and the jump list (the placement alone: a stale
 *   snapshot already made its lane unknown);
 * - `laneLook(status, freshness)`: a lane status on its own (a lead's sign, the agent card's chip).
 *
 * The rules, in one place. A proxy wins over everything: it idles, its lamp idles, its dot and tag say where the real
 * figure works. A stale or missing team snapshot overrides every lane's words ("stale since HH:MM", "status unknown")
 * and silences every bubble but a question. The figure follows the debounced posture; the lamp and the dot also take
 * the raw lane (so a lane that has not yet held long enough to move the posture already lights the lamp). Statuses
 * are always words as well as colours.
 */
import { freshnessWords } from "./freshness.ts";
import type { AgentPlacement, Freshness, LaneStatus, Posture, WorldModel } from "./model.ts";

/* ── The scene: the figure and its desk lamp ──────────────────────────── */

/** What a figure at rest shows (a walk is the scene's own fact: the cast adapter lays it on top). */
export type FigurePose = "working" | "blocked" | "stale" | "done" | "idle";

/** What a desk lamp shows: the lane of the agent at the desk, or that the ticket there has stalled. */
export type LampLane = "working" | "waiting" | "idle" | "off" | "dim";

/** The facts at the agent's desk: the ticket there waits on a person, or has stalled. */
export interface DeskFacts {
  waiting?: boolean;
  stalled?: boolean;
}

export interface FigureLook {
  pose: FigurePose;
  /** The ticket on its desk waits on a person: the figure asks (never a proxy). */
  waiting: boolean;
  /** Its building has a stall or a waiting ticket: the alert halo. */
  alert: boolean;
  proxy: boolean;
  lamp: LampLane;
}

/** The agent facts the scene reads; `null` is a desk with nobody at it. */
export type SceneAgent = Pick<AgentPlacement, "presence" | "posture" | "laneStatus" | "alerts">;

/**
 * The figure: focused → working; relaxed → done when its lane says so, else idle; raised-hand → blocked; greyed →
 * stale; a proxy idles. The lamp (the floor, addendum): green working, amber waiting on the operator, grey idle, off
 * when the agent is gone; a stalled ticket dims it whatever the lane. A proxy's desk idles. `into` is filled and
 * returned when given.
 */
export function figureLook(agent: SceneAgent | null, desk: DeskFacts = {}, into?: FigureLook): FigureLook {
  const look = into ?? { pose: "idle", waiting: false, alert: false, proxy: false, lamp: "off" };
  const proxy = agent?.presence === "proxy";
  const waiting = desk.waiting === true;
  look.proxy = proxy;
  look.alert = !!agent && agent.alerts.length > 0;
  look.waiting = !!agent && waiting && !proxy;
  look.pose = !agent || proxy ? "idle" : poseOf(agent.posture, agent.laneStatus);
  look.lamp = lampOf(agent, waiting, desk.stalled === true);
  return look;
}

function poseOf(posture: Posture, lane: LaneStatus): FigurePose {
  if (posture === "focused") return "working";
  if (posture === "raised-hand") return "blocked";
  if (posture === "greyed") return "stale";
  return lane === "done" ? "done" : "idle";
}

function lampOf(agent: SceneAgent | null, waiting: boolean, stalled: boolean): LampLane {
  if (stalled) return "dim";
  if (!agent) return "off";
  if (agent.presence === "proxy") return "idle";
  if (waiting || agent.posture === "raised-hand" || agent.laneStatus === "blocked") return "waiting";
  if (agent.posture === "focused" || agent.laneStatus === "working") return "working";
  return "idle";
}

/* ── A lane status on its own ─────────────────────────────────────────── */

/** The kit's chip for a lane status: a stale or unknown lane is "stalled"; idle shows as "planned". */
export type LaneChipKind = "stalled" | "working" | "blocked" | "done" | "planned";

export interface LaneLook {
  /** The short words: the lane, or what a stale snapshot says instead. */
  words: string;
  chip: LaneChipKind;
}

/**
 * A stale snapshot overrides every lane status: it reads "stale since HH:MM", or "status unknown" before the first
 * snapshot (agents-and-states.md: older than `STALE_AFTER_S` is unknown; the words are `freshnessWords`' `short`).
 */
export function laneLook(status: LaneStatus, freshness: Freshness): LaneLook {
  const stale = freshnessWords(freshness).short;
  if (stale !== null) return { words: stale, chip: "stalled" };
  if (status === "unknown") return { words: "status unknown", chip: "stalled" };
  return { words: status, chip: status === "idle" ? "planned" : status };
}

/* ── Every 2D surface ─────────────────────────────────────────────────── */

/** The dot in a name pill: the lane status by colour, always with its words beside it. */
export type DotTone = "proxy" | "unknown" | "blocked" | "working" | "idle" | "done";

/** The one bubble a figure may carry by default. */
export interface AgentBubble {
  kind: "question" | "blocked" | "alert" | "done";
  text: string;
  tone: "ask" | "alert" | "done";
  title: string;
}

export interface AgentLook {
  tone: DotTone;
  /** The status tag under the name ("working in …", "stale since …", "status unknown", "blocked"), or null. */
  tag: string | null;
  /** The name pill's words (its title and the screen reader's). */
  words: string;
  /** A question, a raised hand, a lit alert, or a fresh "done", in that order; null otherwise. */
  bubble: AgentBubble | null;
  chip: LaneChipKind;
}

/** How long before its end a caption fades: a "done" bubble in that time is no longer fresh. */
const FADE_MS = 4000;

/* ── The sentences ────────────────────────────────────────────────────── */

export interface AgentWords {
  /** The text view's lane words ("blocked on a prompt", "done (herdr's pane status, not a finished ticket)"). */
  lane: string;
  /** The text view's and the agent card's sentence: the lane words and the posture. */
  state: string;
  /** A hand raised, a blocked lane or an open question: the agent needs the person (the jump list counts it). */
  asksHelp: boolean;
  /** The jump list's sentence: "Asks for help." when it does, else its lane status. */
  search: string;
}

/** The agent's state in sentences; statuses are always words. */
export function agentWords(agent: Pick<AgentPlacement, "laneStatus" | "posture" | "caption">): AgentWords {
  const lane = LANE_WORDS[agent.laneStatus];
  const asksHelp = agent.posture === "raised-hand" || agent.laneStatus === "blocked" || agent.caption?.kind === "question";
  return {
    lane,
    state: `${lane}, posture ${POSTURE_WORDS[agent.posture]}`,
    asksHelp,
    search: asksHelp ? "Asks for help." : `${agent.laneStatus === "unknown" ? "Status unknown" : agent.laneStatus[0]!.toUpperCase() + agent.laneStatus.slice(1)}.`,
  };
}

const LANE_WORDS: Record<LaneStatus, string> = {
  working: "working",
  idle: "idle",
  done: "done (herdr's pane status, not a finished ticket)",
  blocked: "blocked on a prompt",
  unknown: "status unknown",
};

const POSTURE_WORDS: Record<Posture, string> = {
  focused: "focused",
  relaxed: "relaxed",
  "raised-hand": "hand raised",
  greyed: "greyed out",
};

/** What the 2D surfaces show of an agent. `workingIn` is the name of the building a proxy's real figure works in. */
export function agentLook(agent: AgentPlacement, view: Pick<WorldModel, "freshness" | "now">, workingIn = ""): AgentLook {
  const { freshness } = view;
  const proxy = agent.presence === "proxy";
  const lane = laneLook(agent.laneStatus, freshness);
  const tag = tagOf(agent, freshness, workingIn);
  return {
    tone: toneOf(agent, freshness),
    tag,
    words: proxy ? (tag ?? "working elsewhere") : lane.words,
    bubble: bubbleOf(agent, view),
    chip: lane.chip,
  };
}

function tagOf(agent: AgentPlacement, freshness: Freshness, workingIn: string): string | null {
  if (agent.presence === "proxy") return `working in ${workingIn}${agent.locationInferred ? " (inferred)" : ""}`;
  const stale = freshnessWords(freshness).short;
  if (stale !== null) return stale;
  if (agent.posture === "greyed") return "status unknown";
  if (agent.posture === "raised-hand") return "blocked";
  return null;
}

function toneOf(agent: AgentPlacement, freshness: Freshness): DotTone {
  if (agent.presence === "proxy") return "proxy";
  if (freshness.stale || agent.laneStatus === "unknown" || agent.posture === "greyed") return "unknown";
  if (agent.posture === "raised-hand" || agent.laneStatus === "blocked") return "blocked";
  return agent.laneStatus;
}

function bubbleOf(agent: AgentPlacement, view: Pick<WorldModel, "freshness" | "now">): AgentBubble | null {
  if (agent.presence !== "real") return null;
  const caption = agent.caption;
  if (caption?.kind === "question") return { kind: "question", text: "a little help?", tone: "ask", title: `${agent.displayName} asks on ${caption.ticketKey}: ${caption.text}` };
  if (view.freshness.stale) return null;
  if (agent.posture === "raised-hand") return { kind: "blocked", text: "blocked", tone: "ask", title: `${agent.displayName} is blocked` };
  const alert = agent.alerts[0];
  if (alert) return { kind: "alert", text: alert, tone: "alert", title: agent.alerts.join("; ") };
  if (caption?.kind === "done" && (caption.until == null || caption.until - view.now >= FADE_MS))
    return { kind: "done", text: "done", tone: "done", title: `${agent.displayName} on ${caption.ticketKey}: ${caption.text}` };
  return null;
}

/**
 * The lanes and computers of the demo's agents, in the shapes crewhub-loops 4cdcd383 serves (`contracts/agents.py`
 * `AgentLane`, `AgentDetailOut.computer/external/reader/notPickedUp/needsLoginSince`, `contracts/team.py`
 * `TeamSession.computer`). The storyline knows no lanes (it plays work, not an installation), so they are scripted
 * here by agent id, with the drift a real probe would report: the agent card in demo mode then shows everything it
 * would show against a real loops, and the fake crewhub-loops serves the same facts (one source, `@crewhub/demo`).
 * Pure functions of their inputs; `now` is the demo clock, so the same position gives the same answer.
 */
import type { AgentLane, AgentOut, ComputerOut, LaneObserved, TeamSnapshot } from "@crewhub/loops-client";

/** The machine the demo installation runs on, as the Mac app names it. */
export const DEMO_COMPUTER: ComputerOut = { name: "This computer", kind: "this" };

interface LaneScript {
  kind: AgentLane["kind"];
  model: string | null;
  effort: string | null;
  permissionMode: string;
  /** What the probe saw; `null` is never seen. Values left out are the desired ones (no drift there). */
  observed: Partial<Pick<LaneObserved, "kind" | "model" | "effort" | "permissionMode">> | null;
  source: LaneObserved["source"];
  lifecycle: AgentLane["lifecycle"];
  restarting: boolean;
  /** CL-329: minutes ago its tool said the login expired. */
  needsLoginMinutes?: number;
  /** CL-314: deliveries it has not picked up for over a day. */
  notPickedUp?: number;
}

/** The small-team storyline's agents, each with a story the card can tell. Any other agent gets `DEFAULT_SCRIPT`. */
const SCRIPTS: Record<string, LaneScript> = {
  // The CrewHub lead: set up and seen exactly so, known from how loops started it.
  "g-man": { kind: "claude", model: "claude-fable-5-1", effort: "high", permissionMode: "bypassPermissions", observed: {}, source: "started", lifecycle: "fixed", restarting: false },
  // A model drift: the installation wants Fable, the probe sees Opus in the pane.
  "cr-lead": { kind: "claude", model: "claude-fable-5-1", effort: "high", permissionMode: "acceptEdits", observed: { model: "claude-opus-5-5" }, source: "probe", lifecycle: "fixed", restarting: false },
  // As set up, seen by the probe.
  "cl-lead": { kind: "claude", model: "claude-sonnet-5-5", effort: "medium", permissionMode: "auto", observed: {}, source: "probe", lifecycle: "fixed", restarting: false },
  // A lane never seen running, restarting right now.
  marky: { kind: "codex", model: "codex-large", effort: "medium", permissionMode: "default", observed: null, source: "probe", lifecycle: "fixed", restarting: true },
  // Two drifts at once: the effort and the permission mode; the effort it runs at is unreadable.
  analyst: { kind: "opencode", model: "local-coder", effort: "low", permissionMode: "plan", observed: { effort: null, permissionMode: "auto" }, source: "probe", lifecycle: "fixed", restarting: false },
  // A closed lane whose tool wants a login again, with mail piling up.
  "ux-lead": { kind: "claude", model: "claude-haiku-5-5", effort: "low", permissionMode: "auto", observed: {}, source: "probe", lifecycle: "closed", restarting: false, needsLoginMinutes: 40, notPickedUp: 3 },
  // The router: a small model, as set up.
  postman: { kind: "claude", model: "claude-haiku-5-5", effort: "low", permissionMode: "bypassPermissions", observed: {}, source: "started", lifecycle: "fixed", restarting: false },
};

const DEFAULT_SCRIPT: LaneScript = { kind: "claude", model: "claude-sonnet-5-5", effort: "medium", permissionMode: "auto", observed: {}, source: "probe", lifecycle: "fixed", restarting: false };

/** The keys loops compares (`AgentLane.drift`): an observed value that is set and differs from the desired one. */
function driftOf(desired: AgentLane["desired"], observed: LaneObserved, kind: AgentLane["kind"]): string[] {
  const drift: string[] = [];
  if (observed.kind !== null && observed.kind !== kind) drift.push("kind");
  if (observed.model !== null && observed.model !== desired.model) drift.push("model");
  if (observed.effort !== null && observed.effort !== desired.effort) drift.push("effort");
  if (observed.account !== null && observed.account !== desired.account) drift.push("account");
  if (observed.permissionMode !== null && observed.permissionMode !== desired.permissionMode) drift.push("permissionMode");
  return drift;
}

/**
 * The lane of one agent, scripted by its id, in `pane` (herdr's `<workspace>:<pane>`); `null` for a probe (as loops:
 * the probes have no lane of their own). The probe's sighting is 30 s before `now`.
 */
export function laneOf(agent: Pick<AgentOut, "id" | "role" | "herdrSession">, pane: string, now: Date): AgentLane | null {
  if (agent.role === "probe") return null;
  const script = SCRIPTS[agent.id] ?? DEFAULT_SCRIPT;
  const desired: AgentLane["desired"] = { model: script.model, effort: script.effort, account: 1, permissionMode: script.permissionMode };
  const observed: LaneObserved | null =
    script.observed === null
      ? null
      : {
          kind: "kind" in script.observed ? (script.observed.kind ?? null) : script.kind,
          model: "model" in script.observed ? (script.observed.model ?? null) : script.model,
          effort: "effort" in script.observed ? (script.observed.effort ?? null) : script.effort,
          account: 1,
          permissionMode: "permissionMode" in script.observed ? (script.observed.permissionMode ?? null) : script.permissionMode,
          source: script.source,
        };
  return {
    id: `la_${agent.id}`,
    kind: script.kind,
    session: agent.herdrSession ?? "ekinsol",
    name: agent.id,
    pane,
    desired,
    observed,
    observedAt: observed === null ? null : new Date(now.getTime() - 30_000).toISOString(),
    drift: observed === null ? null : driftOf(desired, observed, script.kind),
    lifecycle: script.lifecycle,
    restarting: script.restarting,
  };
}

/** A herdr pane the demo's team knows an agent by (`<workspace>:<pane>`), when it does. */
export type PaneOf = (agentId: string) => string | null;

/**
 * `GET /api/agents` as 4cdcd383 answers it for an installation on this machine: every agent with its computer, its
 * flags and its lane. The pane is the one the demo's team runs the agent in, else the agent's place in the list. An
 * external bot (`AgentOut.external`) keeps its flag and has no lane, as on a real loops.
 */
export function withLanes(agents: AgentOut[], now: Date, paneOf: PaneOf = () => null): AgentOut[] {
  return agents.map((agent, index): AgentOut => {
    const external = agent.external === true;
    const script = agent.role === "probe" || external ? null : (SCRIPTS[agent.id] ?? DEFAULT_SCRIPT);
    return {
      ...agent,
      computer: DEMO_COMPUTER,
      external,
      reader: false,
      notPickedUp: script?.notPickedUp ?? 0,
      needsLoginSince: script?.needsLoginMinutes === undefined ? null : new Date(now.getTime() - script.needsLoginMinutes * 60_000).toISOString(),
      // An external bot has no lane (CL-314: it runs elsewhere, loops has no pane for it), as every probe.
      lane: external ? null : laneOf(agent, paneOf(agent.id) ?? `w1:p${index + 1}`, now),
    };
  });
}

/** `GET /api/team` as 4cdcd383 answers it: every session names its computer (CL-459). */
export function teamWithComputers(team: TeamSnapshot): TeamSnapshot {
  return { ...team, sessions: team.sessions.map((session) => ({ ...session, computer: DEMO_COMPUTER })) };
}

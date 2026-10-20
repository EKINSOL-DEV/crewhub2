/**
 * The lanes and computers the fake adds to the demo's agents and team, in the shapes crewhub-loops 4cdcd383 serves
 * (`contracts/agents.py` `AgentLane`, `AgentDetailOut.computer/external/reader/notPickedUp/needsLoginSince`,
 * `contracts/team.py` `TeamSession.computer`). The demo itself knows no lanes (it plays a storyline, not an
 * installation), so the fake scripts them here, deterministically by agent id, with the drift a real probe would
 * report: the agent card in live mode against the fake then shows everything it would show against a real loops.
 * Pure functions; the fake's routes call them on every answer.
 */
import type { AgentLane, AgentOut, ComputerOut, LaneObserved, TeamSnapshot } from "@crewhub/loops-client";

/** The machine the fake pretends to be, as the Mac app names it. */
export const FAKE_COMPUTER: ComputerOut = { name: "This computer", kind: "this" };

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

/** The lane of one agent, scripted by its id; `null` for a probe (as loops: the probes have no lane of their own). */
export function laneOf(agent: AgentOut, index: number, now: Date): AgentLane | null {
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
    pane: `w1:p${index + 1}`,
    desired,
    observed,
    observedAt: observed === null ? null : new Date(now.getTime() - 30_000).toISOString(),
    drift: observed === null ? null : driftOf(desired, observed, script.kind),
    lifecycle: script.lifecycle,
    restarting: script.restarting,
  };
}

/**
 * `GET /api/agents` as 4cdcd383 answers it: every demo agent with its lane, computer and flags, and the key's own
 * principal as the external bot it is (CL-314: `external`, `herdrSession: "external:none"`, no lane, seen just now),
 * unless the demo already lists an agent by that name.
 */
export function agentsWithLanes(agents: AgentOut[], keyName: string, now: Date): AgentOut[] {
  const out = agents.map((agent, index): AgentOut => {
    const script = agent.role === "probe" ? null : (SCRIPTS[agent.id] ?? DEFAULT_SCRIPT);
    return {
      ...agent,
      computer: FAKE_COMPUTER,
      external: false,
      reader: false,
      notPickedUp: script?.notPickedUp ?? 0,
      needsLoginSince: script?.needsLoginMinutes === undefined ? null : new Date(now.getTime() - script.needsLoginMinutes * 60_000).toISOString(),
      lane: laneOf(agent, index, now),
      rights: null,
    };
  });
  if (!out.some((a) => a.id === keyName)) {
    out.push({
      id: keyName,
      displayName: "CrewHub World",
      role: "lead",
      herdrSession: "external:none",
      computer: FAKE_COMPUTER,
      disabled: false,
      lastSeenAt: now.toISOString(),
      keys: null,
      isCrewhubLead: false,
      isCoordinator: false,
      isOperator: false,
      isLauncher: false,
      isBuilderReader: false,
      successorId: null,
      external: true,
      reader: false,
      notPickedUp: 0,
      needsLoginSince: null,
      projects: { lead: [], member: [] },
      lane: null,
      rights: null,
      revision: 1,
    });
  }
  return out;
}

/** `GET /api/team` as 4cdcd383 answers it: every session names its computer (CL-459). */
export function teamWithComputers(team: TeamSnapshot): TeamSnapshot {
  return { ...team, sessions: team.sessions.map((session) => ({ ...session, computer: FAKE_COMPUTER })) };
}

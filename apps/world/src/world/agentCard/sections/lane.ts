/* "Lane": what loops knows about the lane that runs the agent (`AgentDetailOut.lane` at 4cdcd383: what it is set up
   as, what was seen running and by whom, the drift between the two in words, lifecycle and restarting, session and
   pane), the computer, and the flags of the installation (role, CrewHub lead, coordinator, operator, external bot,
   reader, needs login, deliveries not picked up). A real loops gives these; the demo gives some or none. An agent
   without a lane says so: an external bot runs elsewhere, a laneless agent has no pane loops knows of. Applies only
   when a fact is present; nothing is invented. */
import type { AgentLaneFacts } from "@crewhub/world-model";
import type { AgentCardSection, CardChip, CardRow } from "../types.ts";
import { agoWords, stampOf } from "../words.ts";

/** The drift keys as loops names them (`AgentLane.drift`), in words. */
const DRIFT_WORDS: Record<string, string> = { kind: "kind", model: "model", effort: "effort", account: "account", permissionMode: "permission mode", permission_mode: "permission mode" };

/** The desired and the observed value behind a drift key, for "set up as X, seen Y". */
function driftValues(lane: AgentLaneFacts, key: string): [string | null, string | null] {
  const observed = lane.observed;
  switch (key) {
    case "kind":
      return [lane.kind, observed?.kind ?? null];
    case "model":
      return [lane.model, observed?.model ?? null];
    case "effort":
      return [lane.effort, observed?.effort ?? null];
    case "account":
      return [lane.account === null ? null : String(lane.account), observed?.account == null ? null : String(observed.account)];
    case "permissionMode":
    case "permission_mode":
      return [lane.permissionMode, observed?.permissionMode ?? null];
    default:
      return [null, null];
  }
}

/** "This computer, where loops runs" or "buildbox, remote": the machine, with its kind in words. */
export function computerWords(computer: { name: string; kind: string }): string {
  if (computer.kind === "this") return `${computer.name}, where loops runs`;
  if (computer.kind === "remote") return `${computer.name}, remote`;
  return computer.name;
}

export const laneSection: AgentCardSection = {
  id: "lane",
  title: "Lane",
  when: (facts) => facts.lane !== null || facts.loops !== null || facts.teamSession?.computer != null || (facts.team !== null && !facts.registered),
  render(facts, ctx) {
    const rows: CardRow[] = [];
    const lane = facts.lane;
    const loops = facts.loops;
    if (lane) {
      const setUp = [lane.kind, lane.model, lane.effort ? `effort ${lane.effort}` : null].filter((x): x is string => x !== null);
      if (setUp.length) rows.push({ kind: "text", label: "Set up as", text: setUp.join(", "), mono: true });
      if (lane.permissionMode) rows.push({ kind: "text", label: "Permission mode", text: lane.permissionMode, mono: true });
      if (lane.observed) {
        const o = lane.observed;
        const seen = [o.kind, o.model, o.effort ? `effort ${o.effort}` : null, o.permissionMode ? `mode ${o.permissionMode}` : null].filter((x): x is string => x !== null);
        const by = o.source === "probe" ? "by the probe" : o.source === "started" ? "from its start" : null;
        const at = stampOf(lane.observedAt);
        const when = at === null ? null : agoWords(at, ctx.now);
        const how = [by, when].filter((x): x is string => x !== null).join(", ");
        rows.push({ kind: "text", label: "Seen running", text: `${seen.length ? seen.join(", ") : "nothing readable"}${how ? ` (${how})` : ""}`, mono: true });
        if (lane.drift.length) {
          // One short chip names the drifting fields (a chip does not wrap); a text row per field gives both values.
          const words = lane.drift.map((key) => DRIFT_WORDS[key] ?? key);
          rows.push({ kind: "chips", chips: [{ kind: "attention", text: `drift in ${words.join(", ")}` }] });
          for (const key of lane.drift) {
            const [wanted, saw] = driftValues(lane, key);
            rows.push({ kind: "text", label: `${DRIFT_WORDS[key] ?? key} drift`, text: `set up as ${wanted ?? "unset"}, seen ${saw ?? "unknown"}`, mono: true });
          }
        } else rows.push({ kind: "text", label: "", text: "No drift: it runs as set up.", muted: true });
      } else if (setUp.length || lane.permissionMode) rows.push({ kind: "text", label: "", text: "Never seen running: no probe has observed this lane.", muted: true });
      if (lane.lifecycle || lane.restarting) rows.push({ kind: "text", label: "Lifecycle", text: `${lane.lifecycle ?? "unknown"}${lane.restarting ? ", restarting now" : ""}` });
      const session = lane.session ?? loops?.herdrSession ?? null;
      if (session) rows.push({ kind: "text", label: "Session", text: `${session}${lane.pane ? `, pane ${lane.pane}` : ""}`, mono: true });
    } else if (loops?.external) {
      rows.push({ kind: "text", label: "", text: `External bot: no lane, it runs elsewhere${loops.reader ? "; reads only" : ""}.` });
    } else if (loops) {
      rows.push({ kind: "text", label: "", text: "No lane: loops has not tied this agent to a pane.", muted: true });
      if (loops.herdrSession) rows.push({ kind: "text", label: "Session", text: loops.herdrSession, mono: true });
    }
    const computer = loops?.computer ?? facts.teamSession?.computer ?? null;
    if (computer) rows.push({ kind: "text", label: "Computer", text: computerWords(computer) });
    if (loops) {
      const flags = [loops.isCrewhubLead ? "CrewHub lead" : null, loops.isCoordinator ? "coordinator" : null, loops.isOperator ? "operator" : null, loops.external ? (loops.reader ? "external bot, reads only" : "external bot") : null, loops.disabled ? "disabled" : null].filter((x): x is string => x !== null);
      rows.push({ kind: "text", label: "In loops", text: `${loops.role}${flags.length ? `, ${flags.join(", ")}` : ""}` });
      const chips: CardChip[] = [];
      const since = stampOf(loops.needsLoginSince);
      if (loops.needsLoginSince) chips.push({ kind: "attention", text: `needs login${since === null ? "" : `, since ${agoWords(since, ctx.now)}`}` });
      if (loops.notPickedUp > 0) chips.push({ kind: "attention", text: `${loops.notPickedUp} ${loops.notPickedUp === 1 ? "delivery" : "deliveries"} not picked up for over a day` });
      if (chips.length) rows.push({ kind: "chips", chips });
    } else if (facts.team && !facts.registered) rows.push({ kind: "text", label: "In loops", text: `a worker of ${facts.team.lead ?? "a lead"}, not registered` });
    return rows;
  },
};

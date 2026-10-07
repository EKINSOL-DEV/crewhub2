/* "Lane": what loops knows about the lane that runs the agent (`AgentDetailOut.lane`: kind, model, effort, permission
   mode, lifecycle, what the probe observed) and the flags of the installation. A real loops gives these; the demo gives
   some or none. Applies only when a fact is present. */
import type { AgentCardSection, CardRow } from "../types.ts";

export const laneSection: AgentCardSection = {
  id: "lane",
  title: "Lane",
  when: (facts) => facts.lane !== null || facts.loops !== null || (facts.team !== null && !facts.registered),
  render(facts) {
    const rows: CardRow[] = [];
    const lane = facts.lane;
    if (lane) {
      const desired = [lane.kind, lane.model, lane.effort ? `effort ${lane.effort}` : null].filter((x): x is string => x !== null);
      if (desired.length) rows.push({ kind: "text", label: "Runs on", text: desired.join(", "), mono: true });
      if (lane.permissionMode) rows.push({ kind: "text", label: "Permission mode", text: lane.permissionMode, mono: true });
      if (lane.lifecycle) rows.push({ kind: "text", label: "Lifecycle", text: `${lane.lifecycle}${lane.restarting ? ", restarting" : ""}` });
      if (lane.observed) {
        const seen = [lane.observed.kind, lane.observed.model, lane.observed.effort ? `effort ${lane.observed.effort}` : null, lane.observed.permissionMode].filter((x): x is string => x !== null);
        if (seen.length) rows.push({ kind: "text", label: "Observed", text: seen.join(", "), mono: true });
        if (lane.drift.length) rows.push({ kind: "chips", chips: [{ kind: "attention", text: `drift: ${lane.drift.join(", ")}` }] });
      } else if (lane.kind || lane.model) rows.push({ kind: "text", label: "", text: "Never observed by the probe.", muted: true });
    }
    const loops = facts.loops;
    if (loops) {
      const flags = [loops.isCrewhubLead ? "CrewHub lead" : null, loops.isCoordinator ? "coordinator" : null, loops.isOperator ? "operator" : null].filter((x): x is string => x !== null);
      rows.push({ kind: "text", label: "In loops", text: `${loops.role}${flags.length ? `, ${flags.join(", ")}` : ""}` });
      if (loops.herdrSession) rows.push({ kind: "text", label: "Session", text: loops.herdrSession, mono: true });
    } else if (facts.team && !facts.registered) rows.push({ kind: "text", label: "In loops", text: `a worker of ${facts.team.lead ?? "a lead"}, not registered` });
    return rows;
  },
};

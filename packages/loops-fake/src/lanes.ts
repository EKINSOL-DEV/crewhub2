/**
 * What the fake adds to the demo's `GET /api/agents`: the key's own principal, listed as the external bot it is. The
 * lanes and computers themselves are the demo's (`@crewhub/demo` `withLanes`, `teamWithComputers`: one source for the
 * demo and the fake). Pure; the fake's agents route calls it on every answer.
 */
import type { AgentOut } from "@crewhub/loops-client";
import { DEMO_COMPUTER } from "@crewhub/demo";

/**
 * `GET /api/agents` as 4cdcd383 answers it: the demo's agents (lanes and computers included) and the key's own
 * principal as the external bot it is (CL-314: `external`, `herdrSession: "external:none"`, no lane, seen just now),
 * unless the demo already lists an agent by that name. The bot belongs to no project, as the development instance's
 * bots do, so it stands in the town hall; the world hides its own key's principal there (it is the observer).
 */
export function withKeyBot(agents: AgentOut[], keyName: string, now: Date): AgentOut[] {
  if (agents.some((a) => a.id === keyName)) return agents;
  return [
    ...agents,
    {
      id: keyName,
      displayName: "CrewHub World",
      role: "lead",
      herdrSession: "external:none",
      computer: DEMO_COMPUTER,
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
    },
  ];
}

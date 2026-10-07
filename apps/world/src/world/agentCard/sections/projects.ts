/* "Projects": the buildings the agent belongs to (where it works now, the ones it leads, the ones it is a member of).
   Applies when loops names any. */
import type { AgentCardSection, CardRow } from "../types.ts";

export const projectsSection: AgentCardSection = {
  id: "projects",
  title: "Projects",
  when: (facts) => facts.homes.length > 0 || (facts.loops !== null && (facts.loops.projects.lead.length > 0 || facts.loops.projects.member.length > 0)),
  render(facts) {
    const rows: CardRow[] = [];
    const leads = new Set(facts.loops?.projects.lead.map((p) => p.slug) ?? []);
    const members = new Set(facts.loops?.projects.member.map((p) => p.slug) ?? []);
    for (const home of facts.homes) {
      const role = leads.has(home.slug) ? "leads it" : members.has(home.slug) ? "member" : facts.building?.slug === home.slug ? "works here" : "belongs here";
      rows.push({ kind: "text", label: `${home.name} (${home.key})`, text: role });
    }
    // Projects loops names that the world has no building for (not loaded, archived under another name).
    for (const p of [...(facts.loops?.projects.lead ?? []), ...(facts.loops?.projects.member ?? [])])
      if (!facts.homes.some((h) => h.slug === p.slug)) rows.push({ kind: "text", label: p.key, text: leads.has(p.slug) ? "leads it (no building here)" : "member (no building here)", muted: true });
    return rows;
  },
};

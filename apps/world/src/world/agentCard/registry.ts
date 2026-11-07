/* The agent card's sections, in the order the card draws them. Adding a section is one file under `sections/` and
   one line here; see docs/AGENT_CARD.md. */
import type { AgentCardFacts } from "@crewhub/world-model";
import { answersSection } from "./sections/answers.ts";
import { laneSection } from "./sections/lane.ts";
import { nowSection } from "./sections/now.ts";
import { projectsSection } from "./sections/projects.ts";
import { recentSection } from "./sections/recent.ts";
import { workSection } from "./sections/work.ts";
import type { AgentCardSection, CardContext, RenderedSection } from "./types.ts";

/** Now, Work and Answers in the open; Lane, Projects and Recent behind "More" (round 22), in this order. */
export const AGENT_CARD_SECTIONS: readonly AgentCardSection[] = [nowSection, workSection, answersSection, { ...laneSection, more: true }, { ...projectsSection, more: true }, { ...recentSection, more: true }];

/** The sections that apply to these facts, rendered; a section whose rows come out empty is left out too. */
export function renderAgentCard(facts: AgentCardFacts, ctx: CardContext, sections: readonly AgentCardSection[] = AGENT_CARD_SECTIONS): RenderedSection[] {
  const out: RenderedSection[] = [];
  for (const section of sections) {
    if (!section.when(facts, ctx)) continue;
    const rows = section.render(facts, ctx);
    if (rows.length) out.push({ id: section.id, title: section.title, more: section.more === true, rows });
  }
  return out;
}

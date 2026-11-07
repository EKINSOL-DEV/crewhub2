/* "Recent": the last facts about the agent from the reducer's history (progress lines, moves, comments, deliveries),
   newest first, at most RECENT_LIMIT. Applies when there is at least one. */
import { agoWords } from "../words.ts";
import type { AgentCardSection } from "../types.ts";

export const recentSection: AgentCardSection = {
  id: "recent",
  title: "Recent",
  when: (facts) => facts.recent.length > 0,
  render: (facts, ctx) => [{ kind: "list", items: facts.recent.map((f) => ({ text: f.text, meta: agoWords(f.ts, ctx.now) })) }],
};

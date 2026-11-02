/* The choice of "Where is …?" (components/WhereForm.tsx) as data, so a test reads it without a DOM. */

export interface WhereAgent {
  key: string;
  displayName: string;
}

/** What the person picked: its value and the name it was shown with. */
export interface WhereChosen {
  key: string;
  name: string;
}

export interface WhereChoice {
  /** The select's value; "" when nobody is in the world and nothing was chosen. */
  selected: string;
  /** The chosen name when it is no longer in the world; null otherwise. */
  gone: string | null;
  /** Options beside the agents and people (the gone name, so the select can still show it). */
  options: { key: string; label: string }[];
}

/** The answer for a chosen name that has left. */
export const goneWords = (name: string): string => `${name} is no longer in the world.`;

/**
 * Before the person picks, the first agent (else the first person). A name the person chose stays chosen when it leaves
 * the world (a person's visit ends, a worker's session goes): the answer says it is gone and the select keeps it as an
 * option of its own, never switching to another agent by itself (round 50, r48-ui U6); it is itself again if it comes
 * back.
 */
export function whereChoice(agents: readonly WhereAgent[], people: readonly (readonly [string, string])[], chosen: WhereChosen | null): WhereChoice {
  if (chosen === null) return { selected: agents[0]?.key ?? people[0]?.[0] ?? "", gone: null, options: [] };
  if (agents.some((a) => a.key === chosen.key) || people.some(([id]) => id === chosen.key)) return { selected: chosen.key, gone: null, options: [] };
  return { selected: chosen.key, gone: chosen.name, options: [{ key: chosen.key, label: `${chosen.name} (no longer in the world)` }] };
}

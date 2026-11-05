/* The Connection panel's crewhub-loops row (walk finding w2-4, round 65): "found through the URL in
   CREWHUB_WORLD_LOOPS_URL (http://…)" broke the variable's name mid-word in the panel's narrow column. The sentence is
   split around the name here, so the panel sets the name on a line of its own that never breaks, the URL or socket
   under it; a road that names no variable (the Mac app's socket or port) keeps its sentence in one piece. Pure. */

const VARIABLE = /\b(CREWHUB_WORLD_LOOPS_[A-Z_]+)\b/;

export interface DiscoveryParts {
  /** The words before the name, without their trailing space. */
  before: string;
  name: string;
  /** The words after the name, without their leading space; empty when the name ends the sentence. */
  after: string;
}

/** The sentence around its variable name, or null when it names none. */
export function splitVariable(sentence: string): DiscoveryParts | null {
  const match = VARIABLE.exec(sentence);
  if (match === null) return null;
  const name = match[1] ?? "";
  return { before: sentence.slice(0, match.index).trimEnd(), name, after: sentence.slice(match.index + name.length).trimStart() };
}

// Readable names for sessions and subagents — never `parent=` or a bare uuid
// (v1 lesson, D-M2-5 subagent grouping).

const ADJECTIVES = [
  "Brave",
  "Curious",
  "Daring",
  "Eager",
  "Gentle",
  "Keen",
  "Lively",
  "Nimble",
  "Plucky",
  "Quiet",
  "Spry",
  "Swift",
  "Tidy",
  "Witty",
  "Zesty",
  "Bold",
] as const;

const CRITTERS = [
  "Otter",
  "Badger",
  "Falcon",
  "Fox",
  "Heron",
  "Ibex",
  "Lynx",
  "Marmot",
  "Newt",
  "Osprey",
  "Puffin",
  "Raven",
  "Stoat",
  "Tern",
  "Vole",
  "Wren",
] as const;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}

/** Deterministic friendly name for an unlabelled session id ("Swift Otter"). */
export function humanizeId(id: string): string {
  const h = hash(id);
  const adj = ADJECTIVES[h % ADJECTIVES.length] as string;
  const critter = CRITTERS[(h >>> 8) % CRITTERS.length] as string;
  return `${adj} ${critter}`;
}

// Deterministic "say the word" intent parser (M7 T1): a small anchored
// command grammar layered over free chat text. Pure — no IPC, no time, no
// randomness — so it can run inline on every message before falling back to
// the Haiku interpreter (see interpret.ts) for anything it doesn't recognize.
//
// The core anti-false-positive rule: the whole trimmed message must BE the
// command (patterns are anchored start-to-end), and it must be short
// (<= MAX_WORDS words). Ordinary chat like "let's go to production" or "can
// you go to the store and buy milk" is prose, not a command, and must fall
// through to `null` untouched.

export const EMOTE_NAMES = ["dance", "spin", "cheer", "wave"] as const;
export type EmoteName = (typeof EMOTE_NAMES)[number];

export type IntentTarget = { type: "hq" } | { type: "plaza" } | { type: "room"; buildingKey: string };

export type Intent =
  | { kind: "goto"; target: IntentTarget }
  | { kind: "emote"; emote: EmoteName }
  | { kind: "say"; text: string };

export interface IntentContext {
  /** Linked rooms — `name` is the project name, matched loosely against user text. */
  rooms: { buildingKey: string; name: string }[];
}

/** Anything longer than this is a sentence, not a command. */
const MAX_WORDS = 6;

const HQ_RE = /^go to (?:the )?(?:headquarters|hq|home base)!?$/i;
const PLAZA_RE = /^go to (?:the )?(?:plaza|center|fountain)!?$/i;
const OUTSIDE_RE = /^(?:come out|go outside)!?$/i;
const EMOTE_RE = /^(?:do a )?(dance|spin|cheer|wave)(?: for me)?!?$/i;
const ROOM_RE = /^go to (?:the )?(.+?)!?$/i;

/**
 * Case-insensitive WORD-BOUNDARY prefix match of `needle` (already lowercased
 * and trimmed) against a room `name`. The room name is split into words on
 * whitespace; the needle must be a prefix of the phrase formed by some
 * contiguous run of words starting at a word boundary and running to the end
 * of the name (e.g. "redesign" matches "Website Redesign" via its second
 * word, "website redesign" matches via both words, and "crew" matches
 * "CrewHub Docs" as a prefix of its first word). This deliberately rejects
 * mid-word matches — "main" must never match "Domain" just because "main" is
 * a substring of it.
 */
function matchesRoomName(name: string, needle: string): boolean {
  const words = name.trim().split(/\s+/);
  return words.some((_, i) => words.slice(i).join(" ").toLowerCase().startsWith(needle));
}

/**
 * Resolves `needle` against each room's name using word-boundary prefix
 * matching (see `matchesRoomName`). Returns the sole match's buildingKey, or
 * null when there is no match or more than one (ambiguous — we never guess
 * between two rooms).
 */
function resolveRoom(needle: string, rooms: IntentContext["rooms"]): string | null {
  const target = needle.trim().toLowerCase();
  if (!target) return null;
  const matches = rooms.filter((r) => matchesRoomName(r.name, target));
  const [only] = matches;
  return matches.length === 1 && only ? only.buildingKey : null;
}

export function parseIntent(text: string, ctx: IntentContext): Intent | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.split(/\s+/).length > MAX_WORDS) return null;

  if (HQ_RE.test(trimmed)) return { kind: "goto", target: { type: "hq" } };
  if (PLAZA_RE.test(trimmed) || OUTSIDE_RE.test(trimmed)) return { kind: "goto", target: { type: "plaza" } };

  const emoteName = EMOTE_RE.exec(trimmed)?.[1];
  if (emoteName) return { kind: "emote", emote: emoteName.toLowerCase() as EmoteName };

  const roomName = ROOM_RE.exec(trimmed)?.[1];
  if (roomName) {
    const buildingKey = resolveRoom(roomName, ctx.rooms);
    if (buildingKey) return { kind: "goto", target: { type: "room", buildingKey } };
  }

  return null;
}

/** Exported for interpret.ts's reply validation — same room-resolution rule everywhere. */
export { resolveRoom };

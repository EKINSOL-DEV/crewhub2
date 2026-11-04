/**
 * How fresh the team snapshot is, and the words for it, once (round 61, W8). The rule: a snapshot that is missing,
 * unreadable or older than `STALE_AFTER_S` is stale, and every lane shows as unknown (agents-and-states.md). The three
 * package surfaces that say so ask here, each for its own sentence: the lane chip and the figure tag (`short`), the
 * text view's Town line (`sentence`), the scripted director's clause under "No plan yet" (`whyUnknown`).
 */
import type { Facts } from "./facts.ts";
import type { Freshness } from "./model.ts";

export const STALE_AFTER_S = 300;

export function freshnessOf(facts: Readonly<Facts>, now: number): Freshness {
  const ts = facts.team?.ts ? facts.team.ts : null;
  const parsed = ts ? Date.parse(ts) : Number.NaN;
  if (ts === null || Number.isNaN(parsed)) return { teamTs: ts, ageSeconds: null, stale: true };
  // loops judges freshness by its own receive time, which GET /api/team does not expose; the probe's
  // `ts` against the source clock is the closest a client can get (team-and-projects.md).
  const ageSeconds = Math.max(0, Math.round((now - parsed) / 1000));
  return { teamTs: ts, ageSeconds, stale: ageSeconds > STALE_AFTER_S };
}

export interface FreshnessWords {
  /** The lane chip's and the figure tag's words for a stale snapshot: "stale since HH:MM" (the viewer's clock), "status unknown" before the first one or for an unreadable stamp; null when fresh. */
  short: string | null;
  /** The text view's Town line: no snapshot yet, stale since the probe's own stamp, or from when and how old. */
  sentence: string;
  /** The director's reason for a status that stays unknown, with its leading space, after "No plan yet"; empty when fresh. */
  whyUnknown: string;
}

/**
 * The words each surface says for `freshness`; every sentence as its surface said it before round 61. `short` follows
 * `stale` alone (the lane chip did); the sentences read the stamp first (the text view and the director did). The two
 * agree on every `Freshness` from `freshnessOf`; they differ for one built by hand with no stamp yet not stale (the
 * building sign's lead chip), where the lane keeps its words and the Town line still says there is no snapshot.
 */
export function freshnessWords(freshness: Freshness): FreshnessWords {
  const { teamTs, stale } = freshness;
  const since = clockTime(teamTs);
  const short = stale ? (since ? `stale since ${since}` : "status unknown") : null;
  if (teamTs === null)
    return {
      short,
      sentence: "No team snapshot: no team probe has reported to this crewhub-loops, so every agent's status is unknown.",
      whyUnknown: " No team probe has reported to this crewhub-loops, so a status stays unknown until one does.",
    };
  if (stale)
    return {
      short,
      sentence: `The team snapshot is stale since ${teamTs}: every agent's status shows as unknown.`,
      whyUnknown: ` The team snapshot is stale since ${teamTs}, so a status shows as unknown until a fresh one.`,
    };
  return { short, sentence: `Team snapshot from ${teamTs}, ${freshness.ageSeconds ?? 0} s old.`, whyUnknown: "" };
}

/** "HH:MM" in the viewer's local time, or null for a missing or unreadable timestamp. */
function clockTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

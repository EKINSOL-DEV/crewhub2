/* Which buildings are built ahead of the enter (TownScene `#prepareInterior`, in idle time), and how many.

   The likely next building is the one a signal points at: the jump list's active row while the list is open (Enter
   goes there), the building under the pointer, the keyboard's focused building (the ring). At most `LIKELY_AHEAD` of
   them hold a built interior and inside layers at a time, the likeliest first: two, because the town keeps three
   interiors (buildingView.ts, `KEPT_INTERIORS`: the entered building and two more), so two built ahead never push
   each other or the entered one out, and because a person has at most two signals at once (a pointer and a keyboard
   or list). One build at a time, in slices with a deadline (`IDLE_STEP_MS`); a candidate that stops being likely
   has its build given up, with what stands kept for the next time. */

export const LIKELY_AHEAD = 2;

/**
 * The buildings to build ahead, likeliest first: the signals in their order of weight, each once, the unknown and
 * empty ones left out, at most `n`.
 */
export function likelyOrder(signals: readonly (string | null | undefined)[], known: (slug: string) => boolean, n = LIKELY_AHEAD): string[] {
  const out: string[] = [];
  for (const slug of signals) {
    if (!slug || out.includes(slug) || !known(slug)) continue;
    out.push(slug);
    if (out.length === n) break;
  }
  return out;
}

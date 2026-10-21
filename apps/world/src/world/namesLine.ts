/* A label that lists people never runs across the screen: the first few names and how many more. The full list stays
   in the text view (describe.ts) and the jump list's card (wayfinding.ts). */

/** How many names a label shows before "+N more". */
export const NAMES_SHOWN = 3;

/**
 * The names as one short line: all of them up to one more than `shown` (a fourth name is no longer than "+1 more"),
 * else the first `shown` and "+N more".
 */
export function namesLine(names: readonly string[], shown = NAMES_SHOWN): string {
  if (names.length <= shown + 1) return names.join(", ");
  return `${names.slice(0, shown).join(", ")} +${names.length - shown} more`;
}

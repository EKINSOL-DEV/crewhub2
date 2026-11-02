/* The page's one polite region (App.tsx): what its text becomes for the next sentence. */

/**
 * The sentence as it is, unless it is the one the region already holds: then the sentence with a no-break space after
 * it, so the region's text changes and a screen reader speaks it again (round 50, r50-a11y N3: "Stopped following." a
 * second time was not heard). A third time drops the space again; a screen reader does not say it. Empty stays empty.
 */
export function nextAnnouncement(before: string, text: string): string {
  return text !== "" && before === text ? `${text} ` : text;
}

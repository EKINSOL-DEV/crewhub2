/* The zone name field's draft (components/ZonePanel, `ZoneName`): typed freely, written to the town document when the
   field is left or Enter is pressed (trimmed; empty is no name; a name that did not change writes nothing), and dropped
   by Escape, which keeps the old name (design choice E1, round 72). Pure, so apps/world/test/zoneNameField.test.ts holds
   it; the component keeps the draft in its state and calls `onCommit` when `write` is set. */

export type ZoneNameEvent = { type: "type"; value: string } | { type: "enter" } | { type: "blur" } | { type: "escape" };

export interface ZoneNameStep {
  /** The draft after the event; null when the field shows the zone's name again. */
  draft: string | null;
  /** What to write to the town document, or null for nothing. `name: null` clears the name. */
  write: { name: string | null } | null;
}

export function zoneNameStep(draft: string | null, current: string | null, event: ZoneNameEvent): ZoneNameStep {
  if (event.type === "type") return { draft: event.value, write: null };
  if (event.type === "escape" || draft === null) return { draft: null, write: null };
  const name = draft.trim() || null;
  return { draft: null, write: name !== current ? { name } : null };
}

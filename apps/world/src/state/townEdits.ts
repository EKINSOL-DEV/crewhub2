/* The town runtime's pure steps (state/town.ts), so a node test can pin them: town.ts itself reaches the world runtime,
   IndexedDB and the host at construction. */
import { applyEdit, type TownContext, type TownDocument, type TownEdit } from "@crewhub/world-model";
import type { InvalidRequest } from "../world/propImport";

/** Several edits as one revision (one undo step): all of them apply, or none, and the first refusal is the answer. */
export function applyEdits(doc: TownDocument, edits: readonly TownEdit[], context: TownContext): { ok: true; doc: TownDocument } | { ok: false; error: string } {
  let next = doc;
  for (const edit of edits) {
    const result = applyEdit(next, edit, context);
    if (!result.ok) return result;
    next = result.doc;
  }
  return { ok: true, doc: next };
}

/** Error objects stand only while their ticket is still a done, unimported prop request (`listed`; a seek can undo it). */
export function visibleInvalid(invalid: ReadonlyMap<string, InvalidRequest>, listed: ReadonlySet<string>): InvalidRequest[] {
  if (!invalid.size) return [];
  return [...invalid.values()].filter((r) => listed.has(r.ticketKey));
}

/** Whether the visible error crates differ from the ones shown: another count, or another request at any place. */
export function invalidChanged(visible: readonly InvalidRequest[], shown: readonly InvalidRequest[]): boolean {
  return visible.length !== shown.length || visible.some((r, i) => r !== shown[i]);
}

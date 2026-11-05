/* What build mode says when the town moved under a person's hands because another browser moved it (round 65,
   w6-12): "Undone in another browser. Revision 7." in the sheet and the live region, so the vanished zone or prop is
   explained. A commit (a placement, a zone, a move) is "Changed"; the world's own record (an amend: a new project's
   plot) is nobody's move and says nothing; an older host that does not name the move says "Changed". Pure. */
import type { TownElsewhere } from "../state/townStore";

export function elsewhereWords(change: TownElsewhere): string | null {
  if (change.op === "amend") return null;
  const what = change.op === "undo" ? "Undone" : change.op === "redo" ? "Redone" : "Changed";
  return `${what} in another browser. Revision ${change.rev}.`;
}

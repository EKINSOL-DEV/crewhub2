/* What build mode's sheet shows of the last thing build mode said (round 65, w6-3). A message about a selected prop
   ("Placed Oak bench on the floor. It is selected: arrow keys move it, R turns it.", "Moved Oak bench to cell 3, 4.",
   a refused move) names the selection it describes; it is shown while that prop is the selected one and clears when
   the selection ends (a click elsewhere, Escape, Undo taking the prop away, Delete). A message about nothing in
   particular ("Removed Oak bench. Undo brings it back.", a refused placement) stays until the next one. Pure. */

export interface Said {
  message: string;
  /** The placement id the message describes, or null for a message about no selection. */
  about: string | null;
}

/** The message the sheet shows: the last one said, unless it describes a selection that has ended. */
export function messageShown(said: Said, selectedId: string | null): string {
  if (said.about !== null && said.about !== selectedId) return "";
  return said.message;
}

/**
 * Undo history of the town document, pure. The history is the last `HISTORY_LIMIT` committed revisions, oldest
 * first, and a cursor on the current one. Committing after an undo drops the redo tail, as in any editor. The
 * browser adapter (`apps/world/src/state/townStore.ts`) stores exactly `entries` (keyed by revision) and the
 * current revision, and rebuilds the history with `restoreHistory` on load.
 */
import type { TownDocument } from "./townDocument.ts";

export const HISTORY_LIMIT = 50;

export interface TownHistory {
  /** Oldest first, strictly increasing revisions, at most `HISTORY_LIMIT`. */
  readonly entries: readonly TownDocument[];
  /** Index of the current document in `entries`. */
  readonly index: number;
}

export function createHistory(doc: TownDocument): TownHistory {
  return { entries: [doc], index: 0 };
}

export function currentDocument(history: TownHistory): TownDocument {
  return history.entries[history.index]!;
}

export const canUndo = (history: TownHistory): boolean => history.index > 0;
export const canRedo = (history: TownHistory): boolean => history.index < history.entries.length - 1;

/**
 * Makes `doc` the current revision. After an undo, the edited document's revision can collide with the redo tail it
 * drops; it is then re-stamped above the newest revision the history has seen, so a stored revision key is never
 * reused for different content. Read the committed document back with `currentDocument`.
 */
export function commitHistory(history: TownHistory, doc: TownDocument): TownHistory {
  const newest = history.entries.at(-1)!.revision;
  const stamped = doc.revision > newest ? doc : { ...doc, revision: newest + 1 };
  const entries = [...history.entries.slice(0, history.index + 1), stamped].slice(-HISTORY_LIMIT);
  return { entries, index: entries.length - 1 };
}

export function undoHistory(history: TownHistory): TownHistory {
  return canUndo(history) ? { entries: history.entries, index: history.index - 1 } : history;
}

export function redoHistory(history: TownHistory): TownHistory {
  return canRedo(history) ? { entries: history.entries, index: history.index + 1 } : history;
}

/**
 * Rebuilds a history from stored documents (any order) and the stored current revision. Keeps the newest
 * `HISTORY_LIMIT`; a missing or unknown current revision falls back to the newest. Returns null when nothing is
 * stored. Callers validate each stored document first and pass only the valid ones.
 */
export function restoreHistory(docs: readonly TownDocument[], currentRevision: number | null): TownHistory | null {
  const byRevision = new Map(docs.map((doc) => [doc.revision, doc]));
  const entries = [...byRevision.values()].sort((a, b) => a.revision - b.revision).slice(-HISTORY_LIMIT);
  if (!entries.length) return null;
  const index = entries.findIndex((doc) => doc.revision === currentRevision);
  return { entries, index: index === -1 ? entries.length - 1 : index };
}

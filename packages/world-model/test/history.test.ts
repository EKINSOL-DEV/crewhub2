import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HISTORY_LIMIT,
  canRedo,
  canUndo,
  commitHistory,
  createHistory,
  currentDocument,
  redoHistory,
  restoreHistory,
  undoHistory,
} from "../src/history.ts";
import type { TownHistory } from "../src/history.ts";
import { applyEdit, emptyTownDocument } from "../src/townDocument.ts";
import type { TownContext } from "../src/townDocument.ts";

const CONTEXT: TownContext = { knownStyles: ["greenhouse"], builtinIds: [] };

/** Each edit moves the crewhub plot one cell right, so the revision's content is recognisable. */
function edited(history: TownHistory, x: number): TownHistory {
  const result = applyEdit(currentDocument(history), { type: "set-plot", slug: "crewhub", cell: { x, z: 0 } }, CONTEXT);
  assert.ok(result.ok);
  return commitHistory(history, result.doc);
}
const plotX = (history: TownHistory) => currentDocument(history).plots[0]?.cell.x ?? null;

test("undo and redo walk the last 50 revisions and stop at both ends", () => {
  let history = createHistory(emptyTownDocument());
  for (let x = 1; x <= 60; x++) history = edited(history, x);
  assert.equal(history.entries.length, HISTORY_LIMIT);
  assert.equal(currentDocument(history).revision, 60);

  let steps = 0;
  while (canUndo(history)) {
    history = undoHistory(history);
    steps++;
  }
  assert.equal(steps, HISTORY_LIMIT - 1);
  // The oldest kept revision is 11 (plot at x 11); older ones fell off.
  assert.equal(currentDocument(history).revision, 11);
  assert.equal(plotX(history), 11);
  assert.equal(undoHistory(history), history);

  for (let i = 0; i < 20; i++) history = redoHistory(history);
  assert.equal(plotX(history), 31);
  while (canRedo(history)) history = redoHistory(history);
  assert.equal(plotX(history), 60);
  assert.equal(redoHistory(history), history);
});

test("an edit after undo drops the redo tail and never reuses a revision", () => {
  let history = createHistory(emptyTownDocument());
  for (let x = 1; x <= 5; x++) history = edited(history, x);
  history = undoHistory(undoHistory(history));
  assert.equal(currentDocument(history).revision, 3);
  history = edited(history, 42);
  assert.equal(canRedo(history), false);
  assert.equal(currentDocument(history).revision, 6);
  assert.deepEqual(history.entries.map((d) => d.revision), [0, 1, 2, 3, 6]);
  assert.equal(plotX(undoHistory(history)), 3);
});

test("a stored history restores its current revision, falling back to the newest", () => {
  let history = createHistory(emptyTownDocument());
  for (let x = 1; x <= 55; x++) history = edited(history, x);
  history = undoHistory(undoHistory(history));
  const stored = [...history.entries].reverse();
  const restored = restoreHistory(stored, currentDocument(history).revision);
  assert.ok(restored);
  assert.deepEqual(restored, history);
  assert.equal(restoreHistory(stored, 999)?.index, HISTORY_LIMIT - 1);
  assert.equal(restoreHistory([], null), null);
});

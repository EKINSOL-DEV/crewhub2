/* The host's word that the town changed, handed from the source to the town store (state/townBus.ts): since round 65
   (w6-12) the move too, so another browser's undo can be said. Nothing tested the bus itself (round 68, mx2). */
import assert from "node:assert/strict";
import test from "node:test";
import { hostTownChanged, onHostTown } from "../src/state/townBus.ts";

test("w6-12 (round 68, mx2: townBus.ts:20): the host's revision and its move reach every listener until it stops; a host that names no move hands undefined", () => {
  const heard: [number, string | undefined][] = [];
  const other: number[] = [];
  const stop = onHostTown((rev, op) => heard.push([rev, op]));
  const stopOther = onHostTown((rev) => other.push(rev));
  hostTownChanged(7, "undo");
  hostTownChanged(8);
  stop();
  hostTownChanged(9, "redo");
  stopOther();
  assert.deepEqual(heard, [[7, "undo"], [8, undefined]]);
  assert.deepEqual(other, [7, 8, 9]);
});

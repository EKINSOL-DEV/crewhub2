import assert from "node:assert/strict";
import test from "node:test";
import type { Rotation } from "@crewhub/world-engine";
import { reposeAction } from "../src/world/placements.ts";

const turns: Rotation[] = [0, 1, 2, 3];

test("w6-4: a repose that asks another rotation is a turn, one that asks the rotation the prop stands at is a move", () => {
  for (const previous of turns) {
    assert.equal(reposeAction(previous, previous), "move");
    for (const rotation of turns) if (rotation !== previous) assert.equal(reposeAction(rotation, previous), "turn");
  }
});

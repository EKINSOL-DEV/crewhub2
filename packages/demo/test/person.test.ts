/* The storyline's moves into Done are a person's (spec addendum "a person in the world"): the fake replays these
   envelopes as they are, so the world's person visits show in demo and fake mode alike. */
import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_PERSON } from "../src/store.ts";
import { envelopes, firstLoop, playLoop } from "./helpers.ts";

test("every move into Done in the storyline is made by a user principal, never an agent", () => {
  const run = playLoop();
  const moves = envelopes(firstLoop(run.messages)).filter((e) => e.type === "ticket.moved" && (e.payload as { to: string }).to === "done");
  assert.ok(moves.length >= 5, `storyline moves into Done: ${moves.length}`);
  for (const move of moves) assert.equal(move.actor.kind, "user", `${move.ticket?.key} moved to done by ${move.actor.id} (${move.actor.kind})`);
  assert.ok(moves.some((m) => m.actor.id === DEMO_PERSON));
  // The one rejection of the storyline is a person's too, with its reason in the payload.
  const rejected = moves.filter((m) => (m.payload as { resolution?: string }).resolution === "rejected");
  assert.ok(rejected.length >= 1 && rejected.every((m) => m.actor.kind === "user"));
});

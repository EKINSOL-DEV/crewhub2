/* The fake's clock through a pause (round 64, w2-3): the Mac slept an hour with the fake running and every event it
   stamped afterwards was an hour behind `date -u`, so the page showed a stale snapshot under a Live chip. A real
   crewhub-loops stamps real time. The fake's scheduler is injected here: the wall clock jumps an hour without a tick
   (a sleep fires none), then one tick runs; what the fake stamps next must be the wall's time, not the story's. */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { type LoopsFake, createLoopsFake } from "../src/index.ts";

const fakes: LoopsFake[] = [];
after(async () => {
  for (const fake of fakes) await fake.close();
});

test("after a pause of the wall clock the fake stamps wall time, not the story's time an hour behind", async () => {
  const start = Date.parse("2026-11-05T07:00:00.000Z");
  let wall = start;
  let tick: () => void = () => assert.fail("the player set no interval");
  const scheduler = { now: () => wall, setInterval: (fn: () => void) => ((tick = fn), 1), clearInterval: () => {} };
  const fake = await createLoopsFake({ speed: 1, scheduler });
  fakes.push(fake);
  const headers = { authorization: `Bearer ${fake.key}` };
  const events = async (after: number) => (await (await fetch(`${fake.url}/api/events?after=${after}&limit=500`, { headers })).json()) as { events: { seq: number; type: string; ts: string }[]; lastSeq: number };
  // Running: a minute of ticks, the clock at the wall's.
  for (let i = 0; i < 600; i++) {
    wall += 100;
    tick();
  }
  const lastMove = async (afterSeq: number) => {
    const moves = (await events(afterSeq)).events.filter((e) => e.type === "ticket.moved");
    assert.ok(moves.length > 0, "the move is in the log");
    return moves[moves.length - 1]!;
  };
  const tail = (await events(0)).lastSeq;
  await fake.moveTicket("CR-19", "review");
  const moved = await lastMove(tail);
  assert.equal(Date.parse(moved.ts), wall, "running: an outside action is stamped at the wall's time");
  // Asleep for an hour: no tick fires; then the first tick after waking.
  wall += 3_600_000;
  tick();
  await fake.moveTicket("CR-19", "in_progress");
  const after = await lastMove(moved.seq);
  assert.equal(Date.parse(after.ts), wall, "after the pause: stamped at the wall's time, not an hour behind");
  // The story played at most its step, in order: every line between the two moves is stamped within the step of the wall.
  const between = (await events(moved.seq)).events.filter((e) => e.seq < after.seq);
  for (const e of between) assert.ok(Date.parse(e.ts) >= wall - 5_000, `${e.type} seq ${e.seq} stamped ${e.ts}, the wall at ${new Date(wall).toISOString()}`);
});

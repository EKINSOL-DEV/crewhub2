/* Round 45: the director feed's plan stamps over several feed-days. `stamps` carried one entry per plan for as long as
   the page lived (round 44 measured about 12 a loop, up to 400 a feed-day and 6,400 a real day at 16x); now the stamps
   older than a day go as each plan is stamped, so the feed holds at most a day's plans while `usage()` reads exactly
   as before. The models are the demo's own, one loop at 10 s of demo time, replayed over four feed-days by shifting
   `now`; the test keeps every plan's time itself and recounts the windows. */
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { DEFAULT_PRESENCE, Projection, emptyMemory, reduceWorld, type PresenceSettings, type WorldModel } from "@crewhub/world-model";
import { createDirectorFeed } from "../src/director.ts";
import { createManualScheduler } from "../src/scheduler.ts";
import { DEMO_SEED, SCRIPT_DURATION_MS } from "../src/script.ts";
import { createDemoSource } from "../src/source.ts";
import { DAY, HOUR, SECOND } from "../src/time.ts";

const on: PresenceSettings = { ...DEFAULT_PRESENCE, directorEnabled: true, plansPerDay: 60 };
const ROOM_PROPS: Readonly<Record<string, readonly string[]>> = { lobby: ["mail", "rest", "coffee", "greenery"], "lead-office": ["greenery"], storage: ["storage"], planning: ["planning"], review: ["review"], dispatch: ["dispatch"] };
const propTags = (_building: string, room: string) => ROOM_PROPS[room] ?? [];
const reachable = (q: { kind: string; tag?: string; room?: string }) => q.kind !== "prop" || propTags("", q.room ?? "").includes(q.tag ?? "");

let models: WorldModel[] = [];
before(async () => {
  const scheduler = createManualScheduler();
  const source = createDemoSource({ scheduler, speed: 16 });
  const projection = new Projection(source, { coalesceMs: 0 });
  let memory = emptyMemory();
  source.start((message) => projection.apply(message));
  const wallStep = (10 * SECOND) / 16;
  for (let wall = 0; wall < SCRIPT_DURATION_MS / 16 - 1_000; wall += wallStep) {
    scheduler.advance(wallStep);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const result = reduceWorld(projection.facts, memory, { now: source.now(), mode: "demo", roleOverrides: {} });
    memory = result.memory;
    models.push(result.model);
  }
  projection.dispose();
});

test("over four feed-days the feed holds at most a day's stamps (the day cap at most) and usage() counts the windows exactly as the plans it made", () => {
  const feed = createDirectorFeed({ seed: DEMO_SEED, reachable, propTags, settings: on });
  const loopMs = models[models.length - 1]!.now - models[0]!.now + 10 * SECOND;
  const loopsPerDay = Math.ceil(DAY / loopMs);
  const plans: number[] = []; // every plan's clock, as the test counts them
  let held = 0, peakHeld = 0, checks = 0;
  const start = models[0]!.now;
  for (let loop = 0; loop < loopsPerDay * 4; loop++) {
    for (const m of models) {
      const now = m.now + loop * loopMs;
      const made = feed.step({ ...m, now });
      for (const _ of made) plans.push(now - start);
      held = feed.stampsHeld();
      peakHeld = Math.max(peakHeld, held);
      assert.ok(held <= on.plansPerDay, `${held} stamps held, more than a day's cap of ${on.plansPerDay}`);
      if (made.length > 0 || loop % 7 === 0) {
        const clock = now - start;
        const usage = feed.usage();
        assert.equal(usage.plansToday, plans.filter((p) => clock - p < DAY).length, "plansToday is the plans of the last day");
        assert.equal(usage.plansThisHour, plans.filter((p) => clock - p < HOUR).length, "plansThisHour is the plans of the last hour");
        assert.equal(usage.plansTotal, plans.length, "plansTotal is every plan");
        checks++;
      }
    }
  }
  assert.ok(plans.length > on.plansPerDay * 2, `the run made ${plans.length} plans, enough to need the trim`);
  assert.ok(peakHeld >= on.plansPerDay * 0.8, `the stamps reached the day's worth (${peakHeld} of ${on.plansPerDay})`);
  assert.ok(checks > 50);
  console.log(`  directorStamps: ${plans.length} plans over ${loopsPerDay * 4} loops (${(loopsPerDay * 4 * loopMs) / DAY} feed-days), stamps held at the end ${held}, at most ${peakHeld}; ${checks} usage checks`);
});

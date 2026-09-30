import assert from "node:assert/strict";
import { test } from "node:test";
import type { DemoSource } from "../src/source.ts";
import { at } from "../src/time.ts";
import { envelopes, startDemo } from "./helpers.ts";

async function picture(source: DemoSource): Promise<unknown> {
  const events: string[] = [];
  const stop = source.start((m) => {
    if (m.type === "snapshot") events.push(JSON.stringify({ ...m.snapshot, cursor: null }));
  });
  stop();
  const keys = ["CR-21", "CR-24", "CR-35", "CR-37", "CL-80", "CL-44", "MK-5", "MK-12", "OPS-4"];
  const details = await Promise.all(
    keys.map(async (key) => [await source.getTicket(key), await source.getComments(key), await source.getProgress(key)]),
  );
  const deliveries = (await source.getDeliveries()).map((d) => ({ ...d, eventSeq: null }));
  return { snapshot: events[0], details, deliveries, dm: await source.getDmMessages("g-man") };
}

test("seeking back and then forward gives the same state as playing straight through", async () => {
  const straight = startDemo({ speed: 16 });
  straight.play(at("9:30"));
  const target = straight.source.playback.positionMs();
  const replayed = startDemo({ speed: 16 });
  replayed.play(at("12:00"));
  replayed.source.playback.seek(at("2:00"));
  replayed.source.playback.seek(target);
  assert.equal(straight.source.playback.positionMs(), replayed.source.playback.positionMs());
  assert.deepEqual(await picture(replayed.source), await picture(straight.source));
});

test("a seek sends one snapshot whose cursor is above every seq sent before", () => {
  const run = startDemo({ speed: 16 });
  run.play(at("6:00"));
  const before = Math.max(...envelopes(run.messages).map((e) => e.seq));
  const sent = run.messages.length;
  run.source.playback.seek(at("1:00"));
  const after = run.messages.slice(sent);
  assert.equal(after.length, 1);
  assert.equal(after[0]?.type, "snapshot");
  if (after[0]?.type === "snapshot") assert.ok(after[0].snapshot.cursor > before);
  run.play(at("0:30"));
  assert.ok(envelopes(run.messages.slice(sent)).every((e) => e.seq > before));
  assert.ok(run.source.playback.positionMs() >= at("1:28"));
});

test("startAt begins mid-script with the state of that moment", async () => {
  const run = startDemo({ startAt: at("5:10") });
  const first = run.messages[0];
  assert.equal(first?.type, "snapshot");
  if (first?.type === "snapshot") assert.ok(first.snapshot.projects.some((p) => p.slug === "ops-tooling"));
  assert.equal((await run.source.getTicket("CR-37"))?.status, "done");
});

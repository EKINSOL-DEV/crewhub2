import assert from "node:assert/strict";
import { test } from "node:test";
import type { TeamSnapshot } from "@crewhub/loops-client";
import { createManualScheduler } from "../src/scheduler.ts";
import { demoScenario } from "../src/scenarios.ts";
import { SCRIPT_DURATION_MS } from "../src/script.ts";
import { createDemoSource } from "../src/source.ts";
import { at } from "../src/time.ts";
import { envelopes, startDemo } from "./helpers.ts";

/** What the world does on a prop ticket's comment: find the fenced json block and parse it. */
function propFrom(markdown: string | null | undefined): Record<string, unknown> | null {
  const match = /```json\n([\s\S]*?)\n```/.exec(markdown ?? "");
  return match?.[1] === undefined ? null : (JSON.parse(match[1]) as Record<string, unknown>);
}

async function propOf(run: ReturnType<typeof startDemo>, key: string) {
  const comments = await run.source.getComments(key);
  const found = comments.map((c) => propFrom(c.bodyMarkdown)).filter((p) => p !== null);
  return found.at(-1) ?? null;
}

test("the three scripted prop tickets reach Done with their prop on a comment", async () => {
  const run = startDemo();
  run.play(SCRIPT_DURATION_MS - 5_000);
  const props = new Map<string, Record<string, unknown>>();
  for (const key of ["CR-35", "CR-37", "CR-38"]) {
    const ticket = await run.source.getTicket(key);
    assert.equal(ticket?.status, "done", key);
    assert.ok(ticket?.labels?.some((l) => l.name === "prop"));
    assert.match(ticket?.title ?? "", /^Prop: /);
    const prop = await propOf(run, key);
    assert.ok(prop !== null, `${key} carries a prop`);
    assert.equal(prop["format"], "crewhub-prop/1");
    props.set(key, prop);
  }
  // The broken sign is invalid on purpose: a part lies far outside its one-tile footprint.
  const sign = props.get("CR-38") as { footprint: { width: number }; parts: { position: number[] }[] };
  assert.ok(sign.parts.some((p) => Math.abs(p.position[0] ?? 0) > sign.footprint.width));
  const moves = envelopes(run.messages).filter((e) => e.type === "ticket.moved" && e.ticket?.key === "CR-37");
  assert.deepEqual(moves.map((e) => e.payload["to"]), ["planned", "in_progress", "review", "done"]);
  const commentAt = envelopes(run.messages).find((e) => e.type === "comment.created" && e.ticket?.key === "CR-37" && e.actor.id === "cr-lead");
  const reviewAt = moves[2];
  assert.ok(commentAt !== undefined && reviewAt !== undefined && commentAt.seq < reviewAt.seq, "the prop is on the ticket before review");
});

test("createPropRequest runs the same flow from the current position", async () => {
  const run = startDemo();
  run.play(at("1:00"));
  const request = run.source.createPropRequest("a coffee machine");
  assert.equal(request.title, "Prop: a coffee machine");
  run.play(at("2:40"));
  const created = envelopes(run.messages).find((e) => e.type === "ticket.created" && e.ticket?.title === request.title);
  assert.ok(created !== undefined);
  const key = created.ticket?.key ?? "";
  assert.equal((await run.source.getTicket(key))?.status, "done");
  const prop = await propOf(run, key);
  assert.equal(prop?.["id"], "user:coffee-machine");
  const moves = envelopes(run.messages).filter((e) => e.type === "ticket.moved" && e.ticket?.key === key);
  assert.deepEqual(moves.map((e) => [e.payload["to"], e.actor.kind]), [
    ["planned", "user"],
    ["in_progress", "agent"],
    ["review", "agent"],
    ["done", "user"],
  ]);
  // Seq keeps increasing although the request interleaves with the script.
  const seqs = envelopes(run.messages).map((e) => e.seq);
  assert.ok(seqs.every((s, i) => i === 0 || s > (seqs[i - 1] as number)));
});

test("a request made near the loop end is cut at the loop end, never replayed into the next loop", () => {
  const run = startDemo();
  run.play(SCRIPT_DURATION_MS - 40_000);
  run.source.createPropRequest("a late lamp");
  run.play(60_000);
  const titles = envelopes(run.messages).filter((e) => e.type === "ticket.created").map((e) => e.ticket?.title);
  assert.equal(titles.filter((t) => t === "Prop: a late lamp").length, 1);
  assert.equal(run.source.playback.loop(), 1);
});

// Round 48: a visitor's "Request a prop" makes a ticket in the props project, so the storyline's own new tickets there
// take later keys. A lane line that names one of those by its key would point at the visitor's prop instead (Fresh
// install at 1:30: fn-lead's "FN-2: grouping notes by day" named "Prop: a bench"). Every lane line names the same
// ticket, by title, with or without the request.
for (const scenario of ["fresh", "small-team"] as const) {
  test(`${scenario}: a visitor's prop request early in the loop leaves every lane line naming the ticket it named`, async () => {
    const named = async (request: boolean) => {
      const scheduler = createManualScheduler();
      const source = createDemoSource({ scheduler, speed: 16, scenario });
      let team: TeamSnapshot | null = null;
      source.start((m) => {
        if (m.type === "team") team = m.team;
        if (m.type === "snapshot") team = m.snapshot.team;
      });
      scheduler.advance(20_000 / 16);
      if (request) source.createPropRequest("a bench");
      const seen = new Map<string, string>();
      const end = demoScenario(scenario).story.durationMs - 30_000;
      for (let t = 20_000; t < end; t += 2_000) {
        scheduler.advance(2_000 / 16);
        for (const agent of (team as TeamSnapshot | null)?.sessions.flatMap((s) => s.agents) ?? []) {
          const key = /^([A-Z]+-\d+):/.exec(agent.contextLine ?? "")?.[1];
          if (key === undefined) continue;
          const line = `${agent.name} ${(agent.contextLine as string).replace(/^[A-Z]+-\d+/, "<key>")}`;
          if (!seen.has(line)) seen.set(line, (await source.getTicket(key))?.title ?? "(none)");
        }
      }
      return seen;
    };
    const plain = await named(false);
    assert.ok(plain.size > 2, `lane lines seen: ${plain.size}`);
    const withRequest = await named(true);
    assert.deepEqual([...plain.keys()].map((line) => [line, withRequest.get(line)]), [...plain], "the same tickets, by title");
  });
}

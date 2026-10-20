import assert from "node:assert/strict";
import { test } from "node:test";
import type { TicketSeed } from "../../packages/demo/src/content.ts";
import { DEMO_SEED, SMALL_TEAM_STORY, buildStory } from "../../packages/demo/src/script.ts";
import { demoScenarios } from "../../packages/demo/src/scenarios.ts";
import {
  type Resolve,
  type TicketRef,
  NOT_REPLAYED,
  PERSON_ONLY_DONE,
  REPLAYED,
  actorOf,
  agentKeyFile,
  assignRequest,
  checkUrl,
  classify,
  commentRequest,
  convergeMoves,
  createTicketRequest,
  labelsRequest,
  moveRequest,
  progressRequest,
  readKey,
  resolveHandle,
  schedule,
  seedTicketRequest,
  tally,
  waitOnRequest,
  writerFor,
} from "../../tools/lib/seed.ts";

const resolve: Resolve = {
  principal: (id) => (id === "nicky" || id === "cr-lead" ? id : id === "g-man" ? "crewhub-lead" : null),
  label: (project, name) => (project === "crewhub" && name === "prop" ? "lb_prop" : null),
};

function ticket(over: Partial<TicketRef> = {}): TicketRef {
  return { id: "tk_1", key: "CR-21", status: "in_progress", version: 3, assigneeId: "cr-lead", waitingOnId: null, labelIds: [], resolution: null, ...over };
}

test("the URL guard admits the development loops and nothing reserved or remote", () => {
  assert.deepEqual(checkUrl("http://127.0.0.1:8291"), { ok: true, origin: "http://127.0.0.1:8291" });
  assert.deepEqual(checkUrl("http://localhost:8292/"), { ok: true, origin: "http://localhost:8292" });
  for (const [url, word] of [
    ["http://127.0.0.1:8091", "reserved"],
    ["http://127.0.0.1:8000", "reserved"],
    ["http://127.0.0.1:9443", "reserved"],
    ["http://127.0.0.1", "port"],
    ["https://127.0.0.1:8291", "http"],
    ["http://10.0.0.5:8291", "this machine"],
    ["http://127.0.0.1:8291/api", "origin only"],
    ["eight-two-nine-one", "not a URL"],
  ] as const) {
    const verdict = checkUrl(url);
    assert.equal(verdict.ok, false, url);
    if (!verdict.ok) assert.match(verdict.reason, new RegExp(word), url);
  }
});

test("a key file holds one chl_ token and nothing else", () => {
  assert.equal(readKey("chl_abcdefghijklmnopqrstuvwxyz0123\n"), "chl_abcdefghijklmnopqrstuvwxyz0123");
  assert.throws(() => readKey("password=hunter2"), /one chl_ key/);
  assert.throws(() => readKey(""), /one chl_ key/);
});

test("every action of every scenario is either replayed or refused with a loops rule", () => {
  for (const scenario of demoScenarios()) {
    for (const entry of buildStory(scenario.story, DEMO_SEED)) {
      const verdict = classify(entry.action.type);
      if (!verdict.replay) assert.ok(verdict.reason.length > 20 && !verdict.reason.startsWith("no mapping"), `${scenario.id}: ${entry.action.type}`);
    }
  }
  for (const type of REPLAYED) assert.equal(type in NOT_REPLAYED, false, type);
});

test("a seed ticket becomes a create request; Done seeds go to Review for a person, archived ones stay off the board", () => {
  const seed: TicketSeed = { key: "CR-14", title: "Demo badge", kind: "task", priority: "high", status: "done", assignee: "cr-lead", labels: ["prop", "renderer"], body: "Label every demo surface." };
  const built = seedTicketRequest(seed, "crewhub", resolve);
  assert.ok("body" in built);
  assert.deepEqual(built.body, { project: "crewhub", title: "Demo badge", kind: "task", priority: "high", status: "review", bodyMarkdown: "Label every demo surface.", assigneeId: "cr-lead", labels: ["lb_prop"] });
  assert.equal(built.personOnly, "done");
  assert.deepEqual(built.notes, [`created in Review: ${PERSON_ONLY_DONE}`, "label renderer does not exist in crewhub: dropped"]);
  const open = seedTicketRequest({ key: "MK-9", title: "Hero", kind: "task", priority: "normal", status: "in_progress", assignee: "ux-lead", waitingOn: "sam", body: "x" }, "marketing", resolve);
  assert.ok("body" in open);
  assert.equal(open.personOnly, null);
  assert.equal(open.body.assigneeId, undefined);
  assert.deepEqual(open.notes, ["assignee ux-lead is no principal here: left empty", "waitingOn sam is no principal here: left empty"]);
  assert.deepEqual(seedTicketRequest({ key: "CR-8", title: "Ground", kind: "feature", priority: "normal", status: "done", archivedInto: "rl_1", body: "x" }, "crewhub", resolve), { skip: "an archived seed is not on the board" });
});

test("a storyline createTicket maps labels and the assignee the same way", () => {
  const built = createTicketRequest({ type: "createTicket", by: "nicky", project: "crewhub", title: "Prop: a nook", kind: "task", priority: "normal", labels: ["prop"], body: "Build it." }, resolve);
  assert.deepEqual(built.body, { project: "crewhub", title: "Prop: a nook", kind: "task", priority: "normal", status: "backlog", bodyMarkdown: "Build it.", labels: ["lb_prop"] });
  assert.deepEqual(built.notes, []);
});

test("a move is a request, a no-op or a person's", () => {
  assert.deepEqual(moveRequest(ticket(), "review"), { body: { version: 3, status: "review", afterId: null } });
  assert.deepEqual(moveRequest(ticket(), "in_progress"), { skip: "CR-21 is already in_progress" });
  assert.deepEqual(moveRequest(ticket(), "done"), { personOnly: PERSON_ONLY_DONE });
  assert.ok("skip" in moveRequest(ticket({ status: "done", resolution: "rejected" }), "planned"));
});

test("assign, wait and labels patch only what differs and drop names loops does not know", () => {
  assert.deepEqual(assignRequest(ticket(), "cr-lead", resolve), { skip: "CR-21 is already assigned to cr-lead" });
  assert.deepEqual(assignRequest(ticket(), null, resolve), { body: { version: 3, assigneeId: null }, notes: [] });
  assert.deepEqual(assignRequest(ticket(), "ux-lead", resolve), { skip: "assignee ux-lead is no principal here: left empty" });
  assert.deepEqual(waitOnRequest(ticket(), "nicky", resolve), { body: { version: 3, waitingOnId: "nicky" }, notes: [] });
  assert.deepEqual(waitOnRequest(ticket({ waitingOnId: "nicky" }), null, resolve), { body: { version: 3, waitingOnId: null }, notes: [] });
  assert.deepEqual(labelsRequest(ticket(), "crewhub", ["prop", "api"], resolve), { body: { version: 3, labels: ["lb_prop"] }, notes: ["label api does not exist in crewhub: dropped"] });
  assert.deepEqual(labelsRequest(ticket({ labelIds: ["lb_prop"] }), "crewhub", ["prop"], resolve), { skip: "CR-21 already carries those labels" });
});

test("comments and progress lines take loops' shapes", () => {
  assert.deepEqual(commentRequest("Looks right.", null), { bodyMarkdown: "Looks right." });
  assert.deepEqual(commentRequest("Thanks.", "cm_1"), { bodyMarkdown: "Thanks.", parentId: "cm_1" });
  assert.deepEqual(progressRequest({ type: "progress", ticket: "CR-21", agent: "cr-lead", worker: "cr-dev-1", kind: "update", text: "A* passes" }), { text: "cr-dev-1: A* passes", kind: "update" });
  assert.equal(progressRequest({ type: "progress", ticket: "CR-21", agent: "cr-lead", kind: "start", text: "x".repeat(300) }).text.length, 200);
});

test("@id handles name the ticket an entry created; the storyline's handles all resolve", () => {
  const entries = buildStory(SMALL_TEAM_STORY, DEMO_SEED);
  const created = entries.filter((e) => e.action.type === "createTicket");
  assert.ok(created.length >= 3);
  const first = created[0]!;
  assert.deepEqual(resolveHandle(`@${first.id}`, entries), { kind: "created", project: "crewhub", title: (first.action as { title: string }).title });
  assert.deepEqual(resolveHandle("CR-21", entries), { kind: "key", key: "CR-21" });
  assert.equal(resolveHandle("@99999", entries).kind, "missing");
  const release = entries.find((e) => e.action.type === "releaseCreate")!;
  assert.equal(resolveHandle(`@${release.id}`, entries).kind, "missing");
});

test("converging brings tickets back to the seed picture without touching Done", () => {
  const seeds: TicketSeed[] = [
    { key: "CR-21", title: "A*", kind: "feature", priority: "high", status: "in_progress", body: "" },
    { key: "CR-18", title: "Keys", kind: "feature", priority: "high", status: "review", body: "" },
    { key: "CR-14", title: "Badge", kind: "task", priority: "high", status: "done", body: "" },
    { key: "CR-8", title: "Ground", kind: "feature", priority: "normal", status: "done", archivedInto: "rl", body: "" },
  ];
  const now: Record<string, TicketRef> = {
    "CR-21": ticket({ key: "CR-21", status: "review" }),
    "CR-18": ticket({ key: "CR-18", status: "done" }),
    "CR-14": ticket({ key: "CR-14", status: "done" }),
  };
  const moves = convergeMoves(seeds, (seed) => now[seed.key] ?? null);
  assert.deepEqual(moves.map((m) => [m.ticket.key, m.to]), [["CR-21", "in_progress"], ["CR-18", "review"]]);
});

test("the schedule paces entries by the storyline gap over the speed", () => {
  const entries = buildStory(SMALL_TEAM_STORY, DEMO_SEED);
  const paced = schedule(entries, 16);
  assert.equal(paced.length, entries.length);
  assert.equal(paced[0]!.delayMs, Math.round(entries[0]!.at / 16));
  const total = paced.reduce((sum, p) => sum + p.delayMs, 0);
  assert.ok(total <= 60_000 && total >= 55_000, `a 16-minute pass at 16x takes about a minute, not ${total} ms`);
  assert.throws(() => schedule(entries, 0), /above 0/);
});

test("the tally counts results and groups what was not done by reason", () => {
  const laneReason = NOT_REPLAYED["lane"] ?? "";
  const t = tally([
    { id: 1, type: "move", result: "done", key: "CR-21" },
    { id: 2, type: "move", result: "person", reason: PERSON_ONLY_DONE },
    { id: 3, type: "lane", result: "skipped", reason: laneReason },
    { id: 4, type: "lane", result: "skipped", reason: laneReason },
  ]);
  assert.deepEqual(t.results, { done: 1, skipped: 2, refused: 0, person: 1, failed: 0 });
  assert.equal(t.reasons[`lane: ${laneReason}`], 2);
});

test("the author of an action is its demo actor; with that agent's own key the seed writes as it, else as the seed bot", () => {
  assert.equal(actorOf({ type: "comment", by: "cr-lead", ticket: "CR-21", text: "Looks right." }), "cr-lead");
  assert.equal(actorOf({ type: "progress", ticket: "CR-21", agent: "cl-lead", kind: "update", text: "x" }), "cl-lead");
  assert.equal(actorOf({ type: "move", by: "nicky", ticket: "CR-21", to: "done" }), "nicky");
  assert.equal(actorOf({ type: "dmReply", agent: "g-man", text: "x" }), null);
  // Every replayed action of the storyline names an actor, so the right author can write it.
  for (const entry of buildStory(SMALL_TEAM_STORY, DEMO_SEED)) if (classify(entry.action.type).replay) assert.notEqual(actorOf(entry.action), null, entry.action.type);
  assert.equal(agentKeyFile("/keys/", "cr-lead"), "/keys/agent-cr-lead.key");
  assert.equal(agentKeyFile("/keys", "ux-lead"), "/keys/agent-ux-lead.key");
  assert.equal(agentKeyFile("/keys", "../etc/passwd"), null);
  assert.equal(agentKeyFile("/keys", "a/b"), null);
  const keys = new Map([["cr-lead", "chl_cr"]]);
  assert.deepEqual(writerFor("cr-lead", keys), { as: "cr-lead", key: "chl_cr" });
  assert.equal(writerFor("cl-lead", keys), null, "no key: the seed bot writes");
  assert.equal(writerFor("nicky", keys), null, "a person never writes through the seed");
  assert.equal(writerFor(null, keys), null);
});

/**
 * The demo storyline: sixteen minutes of loops-level actions at 1x, then it loops. The times
 * below are the authored ones; `buildScript(seed)` adds a small seeded jitter and keeps the
 * authored order, so every seed tells the same story at slightly different moments.
 * CONTENT.md walks through it minute by minute.
 */
import type { Action } from "./actions.ts";
import { OPS_NEW_DESCRIPTION } from "./content.ts";
import { mulberry32 } from "./prng.ts";
import { DEMO_PROPS, propComment, requestedProp } from "./props.ts";
import { SECOND, at } from "./time.ts";

export const DEMO_SEED = 20261001;
export const SCRIPT_DURATION_MS = at("16:00");
/** The probe uploads at 0:18, 0:48, ...; the poll re-reads GET /api/team at 0:03, 0:33, ... */
const PROBE_OFFSET_MS = 18 * SECOND;
const POLL_OFFSET_MS = 3 * SECOND;
const TEAM_PERIOD_MS = 30 * SECOND;
/** The probe is silent in this window (a bit over five minutes without an upload). */
export const PROBE_SILENCE = { from: at("10:10"), to: at("15:40") } as const;
const JITTER_MS = 1200;
const MIN_GAP_MS = 150;

export interface ScriptEntry {
  /** Stable id: the authoring order. Delivery and ticket handles (`@id`) refer to it. */
  id: number;
  /** Position in the loop, ms. */
  at: number;
  action: Action;
}

type Final = "forwarded" | "uncertain" | "unroutable";

interface Draft {
  id: number;
  base: number;
  jitter: boolean;
  action: Action;
}

class ScriptBuilder {
  readonly drafts: Draft[] = [];
  private nextId: number;

  constructor(firstId = 0) {
    this.nextId = firstId;
  }

  /** Adds an action at "m:ss" (or ms); returns its id. */
  add(time: string | number, action: Action, jitter = true): number {
    const id = this.nextId++;
    this.drafts.push({ id, base: typeof time === "number" ? time : at(time), jitter, action });
    return id;
  }

  /** Adds an action that creates deliveries, and the postman's claim and final state for them. */
  post(time: string | number, action: Action, final: Final = "forwarded", detail?: string): number {
    const id = this.add(time, action);
    const base = typeof time === "number" ? time : at(time);
    this.add(base + 4 * SECOND, { type: "postman", source: id, state: "claimed" });
    const last: Action = { type: "postman", source: id, state: final };
    if (detail !== undefined) last.detail = detail;
    this.add(base + 11 * SECOND, last);
    return id;
  }
}

/**
 * One prop request, start to Done: created (or taken from the backlog), planned by a person,
 * fetched by cr-lead, built by a worker (or the lead), posted as a comment, reviewed, done.
 */
function propFlow(
  s: ScriptBuilder,
  start: number,
  prop: { title?: string; ticket?: string; by?: string; body?: string; json: unknown; worker?: string; doneAfter: number },
): void {
  const t = (seconds: number) => start + seconds * SECOND;
  let ref = prop.ticket ?? "";
  if (prop.title !== undefined) {
    const created = s.post(t(0), {
      type: "createTicket",
      by: prop.by ?? "nicky",
      project: "crewhub",
      title: prop.title,
      kind: "task",
      priority: "normal",
      labels: ["prop"],
      body: prop.body ?? "Build it with the prop-builder skill and post the JSON on this ticket.",
    });
    ref = `@${created}`;
  }
  const worker = prop.worker === undefined ? {} : { worker: prop.worker };
  s.post(t(14), { type: "move", by: "nicky", ticket: ref, to: "planned" });
  s.add(t(32), { type: "assign", by: "cr-lead", ticket: ref, assignee: "cr-lead" });
  s.add(t(36), { type: "move", by: "cr-lead", ticket: ref, to: "in_progress" });
  s.add(t(40), { type: "progress", ticket: ref, agent: "cr-lead", kind: "start", text: "building the prop", ...worker });
  s.add(t(84), {
    type: "progress",
    ticket: ref,
    agent: "cr-lead",
    kind: "update",
    text: "parts placed; checking them against the footprint",
    ...worker,
  });
  s.add(t(102), { type: "comment", by: "cr-lead", ticket: ref, text: propComment(prop.json) });
  s.add(t(106), { type: "move", by: "cr-lead", ticket: ref, to: "review" });
  s.add(t(prop.doneAfter), { type: "move", by: "nicky", ticket: ref, to: "done" });
}

function storyline(s: ScriptBuilder): void {
  // 0:00 to 2:00: a lively morning; Nicky asks for a reading nook.
  s.add("0:02", { type: "progress", ticket: "CR-21", agent: "cr-lead", worker: "cr-dev-1", kind: "update", text: "neighbour expansion done, diagonal cost 1.4" });
  s.add("0:06", { type: "progress", ticket: "CL-81", agent: "cl-lead", kind: "update", text: "release events section written" });
  s.add("0:10", { type: "comment", by: "marky", ticket: "MK-10", text: "Six shots taken; two need the dark theme." });
  s.add("0:14", { type: "progress", ticket: "MK-9", agent: "ux-lead", kind: "update", text: "hero sketch: the town at golden hour, two variants" });
  s.add("0:20", { type: "progress", ticket: "CL-40", agent: "analyst", kind: "update", text: "ticket events mapped; deliveries next" });
  s.add("0:23", { type: "lane", name: "cr-scout", status: "working", contextLine: "comparing the v1 room picker with the town" });
  propFlow(s, at("0:26"), {
    title: "Prop: a reading nook with a lamp",
    body: "A low armchair, a rug and a standing lamp. Place it in the lead's office.",
    json: DEMO_PROPS.readingNook,
    worker: "cr-design-1",
    doneAfter: 176,
  });
  s.add("0:30", { type: "progress", ticket: "CR-22", agent: "cr-lead", worker: "cr-dev-2", kind: "update", text: "pallets instanced; count label next" });
  s.add("0:34", { type: "comment", by: "cl-lead", ticket: "CL-76", text: "The heartbeat now reuses the last sent seq; a test covers it." });
  s.add("0:47", { type: "progress", ticket: "MK-12", agent: "analyst", kind: "update", text: "five numbers, each with how we measure it" });
  s.add("0:50", { type: "waitOn", by: "cr-lead", ticket: "CR-20", on: "nicky" });
  s.add("0:53", { type: "comment", by: "cr-lead", ticket: "CR-20", text: "Fixed by keeping the last camera target on exit. Nicky, can you try it?" });
  s.add("0:57", { type: "lane", name: "cr-design-1", status: "working", contextLine: "CR-37: building the prop" });
  s.add("1:10", { type: "progress", ticket: "CL-44", agent: "cl-lead", worker: "cl-dev-2", kind: "update", text: "tail handler returns lastSeq; wiring the route" });
  s.post("1:14", { type: "comment", by: "sam", ticket: "MK-7", text: "The second headline reads better to me." });
  s.add("1:21", { type: "progress", ticket: "CL-81", agent: "cl-lead", worker: "cl-dev-1", kind: "update", text: "milestone events table done" });
  s.add("1:26", { type: "labels", by: "cl-lead", ticket: "CL-76", labels: ["api", "awaiting-deploy"] });
  s.add("1:30", { type: "progress", ticket: "MK-10", agent: "marky", kind: "update", text: "dark theme shots done" });
  s.post("1:36", { type: "comment", by: "nicky", ticket: "CR-23", text: "\"stale since 09:12\" please; it says what we know." });
  s.add("1:44", { type: "progress", ticket: "CR-23", agent: "cr-lead", kind: "update", text: "using \"stale since\"; the label greys the avatar too" });
  s.add("1:56", { type: "move", by: "marky", ticket: "MK-11", to: "in_progress" });

  // 2:00 to 4:00: A* goes to review and unblocks the postman walk; a stall; a worker starts.
  s.add("2:00", { type: "progress", ticket: "MK-11", agent: "marky", kind: "start", text: "drafting the newsletter around the demo video" });
  s.add("2:04", { type: "comment", by: "analyst", ticket: "CL-40", text: "ticket.moved covers five world reactions; the list is in the body." });
  s.add("2:08", { type: "progress", ticket: "CR-21", agent: "cr-lead", worker: "cr-dev-1", kind: "update", text: "A* passes the room tests; opening it for review" });
  s.post("2:15", { type: "move", by: "cr-lead", ticket: "CR-21", to: "review" });
  s.add("2:20", { type: "lane", name: "cr-dev-1", status: "idle", contextLine: null });
  s.post("2:40", { type: "comment", by: "sam", ticket: "CR-21", text: "Tried it in the Greenhouse room: the paths look natural." });
  s.add("2:45", { type: "lane", name: "cr-design-1", status: "idle", contextLine: null });
  s.add("2:47", { type: "comment", by: "cr-lead", ticket: "CR-21", text: "Thanks. Diagonal corners around doors come next.", replyToLast: true });
  s.post("2:56", { type: "stall", ticket: "CR-24", reason: "stalled", quietMinutes: 22, nudge: true });
  s.add("3:04", { type: "comment", by: "cl-lead", ticket: "CL-83", text: "Yes for the envelope first; payload schemas later." });
  s.add("3:10", { type: "laneJoin", name: "cl-dev-3", status: "unknown", contextLine: null });
  s.add("3:14", { type: "progress", ticket: "CL-81", agent: "cl-lead", kind: "update", text: "catalogue complete; checking it against the drift test" });
  s.add("3:28", { type: "move", by: "nicky", ticket: "CR-18", to: "done" });
  s.add("3:34", { type: "progress", ticket: "CL-40", agent: "analyst", kind: "update", text: "deliveries and DMs mapped to the postman" });
  s.add("3:40", { type: "lane", name: "cl-dev-3", status: "working", contextLine: "CL-44: tests for the tail recipe" });
  s.add("3:44", { type: "comment", by: "cl-lead", ticket: "CL-44", text: "cl-dev-3 joins for the tests." });
  const morning = s.post("3:52", { type: "dm", from: "nicky", agent: "g-man", text: "Morning! How is the town looking?" });

  // 4:00 to 6:00: the fern; OPS comes back; a review reply.
  propFlow(s, at("3:48"), { ticket: "CR-35", json: DEMO_PROPS.tallFern, worker: "cr-dev-1", doneAfter: 230 });
  s.add("4:10", { type: "progress", ticket: "CL-44", agent: "cl-lead", worker: "cl-dev-3", kind: "start", text: "writing tests for the tail recipe" });
  s.add("4:21", { type: "dmReply", agent: "g-man", replyToClientId: `demo-a${morning}`, text: "Busy and calm. CR finished the reading nook, CL is closing the integrator docs, and CR-24 has been quiet for a while." });
  s.add("4:25", { type: "lane", name: "cr-dev-1", status: "working", contextLine: "CR-35: building the prop" });
  s.add("4:30", { type: "lane", name: "cr-dev-2", status: "done", contextLine: "CR-22: pallets merged into the branch" });
  s.add("4:50", { type: "move", by: "cl-lead", ticket: "CL-81", to: "review" });
  s.add("4:54", { type: "progress", ticket: "CL-81", agent: "cl-lead", kind: "done", text: "catalogue done; every type has a row" });
  s.add("5:00", { type: "projectRestore", by: "nicky", project: "ops-tooling" });
  s.post("5:06", { type: "comment", by: "nicky", ticket: "CL-80", text: "Step 3 should say that the Done column holds 30 days." });
  s.add("5:12", { type: "move", by: "cl-lead", ticket: "OPS-4", to: "in_progress" });
  s.add("5:16", { type: "progress", ticket: "OPS-4", agent: "cl-lead", kind: "start", text: "rotating the probe key" });
  s.add("5:22", { type: "lane", name: "cl-lead", contextLine: "OPS-4: new probe key issued" });
  s.add("5:30", { type: "projectUpdate", by: "nicky", project: "ops-tooling", description: OPS_NEW_DESCRIPTION });
  s.add("5:36", { type: "progress", ticket: "CL-80", agent: "cl-lead", kind: "update", text: "step 3 now names the 30-day Done window" });
  s.add("5:44", { type: "progress", ticket: "CR-22", agent: "cr-lead", worker: "cr-dev-2", kind: "done", text: "pallets merged" });
  s.add("5:50", { type: "projectReorder", by: "nicky", slugs: ["crewhub", "crewhub-loops", "ops-tooling", "marketing"] });
  s.add("5:56", { type: "move", by: "cr-lead", ticket: "CR-22", to: "review" });

  // 6:00 to 8:00: the stall ends; launch week is handed to marky; a lane blocks on a prompt.
  s.add("6:00", { type: "lane", name: "cr-dev-2", status: "idle", contextLine: null });
  s.post("6:10", { type: "comment", by: "nicky", ticket: "MK-12", text: "Keep it to three numbers for launch week." });
  s.add("6:20", { type: "progress", ticket: "CR-24", agent: "cr-lead", worker: "cr-design-1", kind: "update", text: "back on the mailbox: a flag for unroutable letters" });
  s.add("6:24", { type: "lane", name: "cr-design-1", status: "working", contextLine: "CR-24: mailbox flag states" });
  s.add("6:30", { type: "resume", ticket: "CR-24", resolution: "activity" });
  s.add("6:36", { type: "progress", ticket: "MK-12", agent: "analyst", kind: "update", text: "cut to three numbers" });
  s.add("6:40", { type: "move", by: "cl-lead", ticket: "CL-80", to: "review" });
  s.add("6:44", { type: "waitOn", by: "cl-lead", ticket: "CL-80", on: "nicky" });
  s.add("7:00", { type: "milestoneState", by: "nicky", milestone: "MK-M1", state: "active" });
  s.post("7:06", { type: "handoff", by: "nicky", milestone: "MK-M1", recipient: "marky" });
  s.add("7:14", { type: "comment", by: "marky", ticket: "MK-14", text: "I'll draft the voice-over after the thread." });
  s.add("7:22", { type: "move", by: "marky", ticket: "MK-13", to: "in_progress" });
  s.add("7:26", { type: "progress", ticket: "MK-13", agent: "marky", kind: "start", text: "seven posts, one per day of launch week" });
  s.add("7:30", { type: "lane", name: "cl-dev-2", status: "blocked", contextLine: "Allow network access to localhost:8000? (y/n)" });
  s.add("7:31", { type: "lane", name: "cl-dev-3", status: "idle", contextLine: null });
  s.add("7:32", { type: "lane", name: "cl-lead", status: "idle" });
  s.post("7:42", { type: "comment", by: "nicky", ticket: "CL-76", text: "Looks right. Ship it with the next release." });
  s.add("7:56", { type: "progress", ticket: "MK-11", agent: "marky", kind: "update", text: "newsletter draft: intro and video link done" });

  // 8:00 to 10:10: attention on CL-44; Dispatch's truck; CL-M3 completes; the broken sign.
  s.add("8:00", { type: "stall", ticket: "CL-44", reason: "attention", quietMinutes: 3, nudge: false });
  s.add("8:06", { type: "archiveDone", by: "nicky", project: "marketing", tickets: ["MK-3", "MK-4", "MK-5"] });
  s.add("8:14", { type: "progress", ticket: "MK-10", agent: "marky", kind: "update", text: "phone screenshots cropped" });
  propFlow(s, at("8:20"), {
    title: "Prop: a broken sign",
    by: "sam",
    body: "An old signpost for the town square.",
    json: DEMO_PROPS.brokenSign,
    worker: "cr-scout",
    doneAfter: 230,
  });
  s.add("8:26", { type: "move", by: "nicky", ticket: "CL-81", to: "done" });
  s.add("8:30", { type: "move", by: "nicky", ticket: "CL-80", to: "done" });
  s.add("8:40", { type: "milestoneState", by: "nicky", milestone: "CL-M3", state: "done" });
  s.add("8:44", { type: "lane", name: "cl-lead", status: "working", contextLine: "OPS-4: restarting the probe" });
  s.add("8:58", { type: "lane", name: "cr-scout", status: "working", contextLine: "CR-38: building the prop" });
  s.add("9:06", { type: "lane", name: "cl-dev-2", status: "working", contextLine: "CL-44: tail route registered" });
  s.add("9:10", { type: "unarchive", by: "sam", ticket: "MK-5" });
  s.post("9:14", { type: "comment", by: "sam", ticket: "MK-5", text: "Unarchived: the press kit needs the new logo." }, "uncertain", "input box held typed text");
  s.add("9:22", { type: "resume", ticket: "CL-44", resolution: "attending" });
  s.add("9:28", { type: "laneLeave", name: "cl-dev-3" });
  s.post("9:31", { type: "assign", by: "nicky", ticket: "MK-16", assignee: "ux-lead" }, "unroutable", "no pane for ux-lead in session ekinsol");
  s.add("9:36", { type: "progress", ticket: "CL-44", agent: "cl-lead", worker: "cl-dev-2", kind: "update", text: "tail route registered; docs next" });
  s.add("9:40", { type: "milestoneCreate", by: "nicky", project: "crewhub-loops", title: "Host stream resume", targetDate: "2026-10-20" });
  s.add("9:45", { type: "milestoneAttach", by: "nicky", milestone: "CL-M4", tickets: ["CL-84", "CL-86"] });
  s.post("9:53", { type: "move", by: "nicky", ticket: "CL-86", to: "planned" });
  s.post("10:04", { type: "releaseRequestPublish", by: "nicky", project: "crewhub" });

  // 10:10 to 15:40: the probe is silent (the world must show "stale since"); work goes on.
  s.add("10:20", { type: "block", by: "cl-lead", ticket: "CL-82", blocker: "CL-44" });
  s.add("10:26", { type: "progress", ticket: "CR-19", agent: "cr-lead", kind: "update", text: "notes and tag ready; publishing 0.3.0" });
  s.add("10:34", { type: "releasePublish", by: "cr-lead", project: "crewhub" });
  s.add("10:50", { type: "lane", name: "cr-scout", status: "idle", contextLine: null });
  s.add("10:56", { type: "progress", ticket: "MK-13", agent: "marky", kind: "update", text: "four of seven posts drafted" });
  s.add("11:04", { type: "comment", by: "cr-lead", ticket: "CR-19", text: "0.3.0 is published; the carrier waits for you." });
  const release = s.post("11:12", {
    type: "releaseCreate",
    by: "nicky",
    project: "crewhub-loops",
    title: "Stream hardening",
    version: "0.9.0",
    tickets: ["CL-70", "CL-71", "CL-72"],
  });
  s.add("11:28", { type: "progress", ticket: `@${release}`, agent: "cl-lead", kind: "start", text: "writing the notes for 0.9.0" });
  s.add("11:34", { type: "move", by: "nicky", ticket: "CR-20", to: "done" });
  s.add("11:40", { type: "progress", ticket: "MK-9", agent: "ux-lead", kind: "update", text: "hero exported in light and dark" });
  s.add("11:46", { type: "move", by: "nicky", ticket: "CR-19", to: "done" });
  s.add("11:52", { type: "comment", by: "marky", ticket: "MK-11", text: "The draft is in the ticket body." });
  s.add("11:58", { type: "progress", ticket: "CL-40", agent: "analyst", kind: "done", text: "mapping done: 35 types, 12 of them skipped" });
  s.add("12:04", { type: "move", by: "analyst", ticket: "CL-40", to: "review" });
  s.add("12:18", { type: "progress", ticket: "CR-24", agent: "cr-lead", worker: "cr-design-1", kind: "update", text: "flag states drawn" });
  s.post("12:26", { type: "comment", by: "sam", ticket: "CR-24", text: "The flag reads well at overview zoom." });
  s.add("12:30", { type: "lane", name: "cr-design-1", status: "idle", contextLine: null });
  s.add("12:34", { type: "progress", ticket: "CL-44", agent: "cl-lead", worker: "cl-dev-2", kind: "update", text: "docs for the tail endpoint" });
  s.add("12:44", { type: "move", by: "nicky", ticket: "MK-7", to: "done" });
  s.add("12:50", { type: "progress", ticket: "MK-12", agent: "analyst", kind: "question", text: "should a returning visitor count once per day?" });
  s.post("12:58", { type: "comment", by: "nicky", ticket: "MK-12", text: "Once per day is fine." });
  s.add("13:00", { type: "lane", name: "cl-dev-2", status: "idle", contextLine: null });
  s.add("13:06", { type: "progress", ticket: "CR-23", agent: "cr-lead", kind: "done", text: "freshness label done; opening it for review" });
  s.add("13:12", { type: "move", by: "cr-lead", ticket: "CR-23", to: "review" });
  s.add("13:20", { type: "progress", ticket: "OPS-4", agent: "cl-lead", kind: "done", text: "the probe runs on the new key; the old key is revoked" });
  s.add("13:28", { type: "move", by: "cl-lead", ticket: "OPS-4", to: "review" });
  s.add("13:36", { type: "move", by: "nicky", ticket: "OPS-4", to: "done" });
  s.add("13:44", { type: "projectArchive", by: "nicky", project: "ops-tooling" });
  s.add("13:52", { type: "progress", ticket: "MK-10", agent: "marky", kind: "update", text: "tour order: town, building, review pile" });
  s.add("14:00", { type: "comment", by: "cl-lead", ticket: "CL-76", text: "Deployed with the stream fixes." });
  s.add("14:10", { type: "move", by: "nicky", ticket: "CL-76", to: "done" });
  s.add("14:18", { type: "progress", ticket: "CR-24", agent: "cr-lead", worker: "cr-design-1", kind: "update", text: "mailbox ready; waiting for the letter model" });
  s.add("14:30", { type: "lane", name: "marky", status: "idle", contextLine: null });
  s.add("14:36", { type: "progress", ticket: "MK-13", agent: "marky", kind: "update", text: "six of seven posts drafted" });
  s.add("14:46", { type: "progress", ticket: `@${release}`, agent: "cl-lead", kind: "update", text: "notes list three stream fixes" });
  s.add("14:58", { type: "progress", ticket: "CL-44", agent: "cl-lead", worker: "cl-dev-2", kind: "update", text: "tail endpoint documented" });
  s.add("15:10", { type: "progress", ticket: "CL-40", agent: "analyst", kind: "update", text: "listing the types the world skips on purpose" });
  s.add("15:22", { type: "progress", ticket: "CR-24", agent: "cr-lead", kind: "update", text: "mailbox model in the branch" });
  s.add("15:34", { type: "lane", name: "marky", status: "working", contextLine: "MK-13: last post of the thread" });
  s.add("15:36", { type: "lane", name: "cl-lead", status: "working", contextLine: "CL-88: release notes for 0.9.0" });

  // 15:27 to 15:50 is quiet on purpose: the stream sends a heartbeat.
  // 15:40 to 16:00: the probe is back, the picture is fresh again, and the loop ends.
  s.add("15:50", { type: "progress", ticket: "MK-13", agent: "marky", kind: "update", text: "the thread is complete" });
  // Background chatter that keeps the stream lively (every 2 to 8 s at 1x).
  s.add("2:32", { type: "comment", by: "cr-lead", ticket: "CR-28", text: "Unblocked; starting once the doors land." });
  s.add("3:38", { type: "comment", by: "ux-lead", ticket: "MK-9", text: "Variant B it is; the postman gets a scarf." });
  s.add("4:36", { type: "progress", ticket: "MK-10", agent: "marky", kind: "update", text: "light theme shots retaken" });
  s.add("4:44", { type: "comment", by: "cl-lead", ticket: "CL-81", text: "Opening it for review after one more pass." });
  s.add("5:26", { type: "comment", by: "cl-lead", ticket: "OPS-4", text: "The old key stays valid until the probe restarts." });
  s.add("5:40", { type: "progress", ticket: "MK-11", agent: "marky", kind: "update", text: "subject line: walk through your projects" });
  s.add("6:05", { type: "comment", by: "cr-lead", ticket: "CR-22", text: "Pallets merged; review when you have a minute." });
  s.add("6:27", { type: "progress", ticket: "MK-9", agent: "ux-lead", kind: "update", text: "adding the postman with a letter to the hero" });
  s.add("6:54", { type: "comment", by: "cl-lead", ticket: "CL-82", text: "Starting after CL-44 lands." });
  s.add("7:34", { type: "progress", ticket: "CR-24", agent: "cr-lead", worker: "cr-design-1", kind: "update", text: "flag colours follow the delivery states" });
  s.add("9:03", { type: "comment", by: "cl-lead", ticket: "CL-44", text: "cl-dev-2 was stuck on a permission prompt; answered." });
  s.add("10:42", { type: "progress", ticket: "CR-24", agent: "cr-lead", worker: "cr-design-1", kind: "update", text: "letter model: an envelope with a coloured band" });
  s.add("10:48", { type: "comment", by: "cl-lead", ticket: "CL-86", text: "Planned; picking it up after CL-82." });
  s.add("11:00", { type: "progress", ticket: "MK-9", agent: "ux-lead", kind: "update", text: "hero placed on the landing page" });
  s.add("12:54", { type: "comment", by: "marky", ticket: "MK-7", text: "Thanks! The copy goes live with the launch." });
  s.add("13:16", { type: "comment", by: "cr-lead", ticket: "CR-23", text: "The label now reads \"stale since 10:28\"." });
  s.add("13:32", { type: "progress", ticket: "MK-11", agent: "marky", kind: "update", text: "newsletter scheduled for launch day" });
  s.post("13:48", { type: "comment", by: "nicky", ticket: "CL-83", text: "Agreed: the envelope schema first." });
  s.post("14:05", { type: "comment", by: "nicky", ticket: "CL-40", text: "Great map. Can you add the types the world skips on purpose?" });
  s.add("14:26", { type: "progress", ticket: "MK-12", agent: "analyst", kind: "update", text: "three numbers written up with their definitions" });
  s.post("14:52", { type: "comment", by: "sam", ticket: "CR-20", text: "The camera stays put now. Nice." });
  s.post("15:16", { type: "comment", by: "nicky", ticket: "MK-14", text: "Keep the voice-over under 90 seconds." });
  s.add("15:56", { type: "comment", by: "cl-lead", ticket: `@${release}`, text: "Notes ready for 0.9.0." });
}

/** Adds jitter and keeps the authored order; probe and poll stay on their 30 s grid. */
function finish(drafts: Draft[], rng: () => number, offset = 0): ScriptEntry[] {
  const sorted = [...drafts].sort((a, b) => a.base - b.base || a.id - b.id);
  const entries: ScriptEntry[] = [];
  let last = -Infinity;
  for (const d of sorted) {
    const jitter = d.jitter ? Math.round((rng() * 2 - 1) * JITTER_MS) : 0;
    const time = Math.max(offset, d.base + jitter, last + MIN_GAP_MS);
    last = time;
    entries.push({ id: d.id, at: time, action: d.action });
  }
  return entries;
}

export function buildScript(seed: number): ScriptEntry[] {
  const s = new ScriptBuilder();
  storyline(s);
  for (let t = POLL_OFFSET_MS; t < SCRIPT_DURATION_MS; t += TEAM_PERIOD_MS) s.add(t, { type: "poll" }, false);
  for (let t = PROBE_OFFSET_MS; t < SCRIPT_DURATION_MS; t += TEAM_PERIOD_MS) {
    if (t > PROBE_SILENCE.from && t < PROBE_SILENCE.to) continue;
    s.add(t, { type: "probe" }, false);
  }
  const entries = finish(s.drafts, mulberry32(seed));
  const late = entries.find((e) => e.at >= SCRIPT_DURATION_MS);
  if (late !== undefined) throw new Error(`Script action ${late.id} falls after the loop end`);
  return entries;
}

/**
 * The on-demand prop request (build mode's "Request a prop", demo only): the same flow as the
 * scripted props, from `fromMs`, with ids from `firstId` up. Actions past the loop end are cut.
 */
export function buildPropRequest(thing: string, fromMs: number, firstId: number, seed: number): ScriptEntry[] {
  const s = new ScriptBuilder(firstId);
  const flowStart = fromMs + SECOND;
  propFlow(s, flowStart, { title: `Prop: ${thing}`, json: requestedProp(thing), doneAfter: 130 });
  return finish(s.drafts, mulberry32(seed ^ firstId), fromMs).filter((e) => e.at < SCRIPT_DURATION_MS);
}

/** Ids one chat exchange uses (the message, the postman's claim and forward, the reply). */
export const DM_ENTRY_STRIDE = 4;

/** What an agent answers in the demo: always labelled, picked by how many messages the person already sent. */
const DEMO_REPLIES: Record<string, readonly string[]> = {
  "g-man": [
    "(demo reply) Noted. I'll pass it to the right lead and report back here.",
    "(demo reply) The town runs on a script tonight, so nothing real moves yet. The leads would pick this up.",
    "(demo reply) Thanks. I'll keep an eye on it and write when something changes.",
  ],
};
const GENERIC_REPLIES: readonly string[] = [
  "(demo reply) Got it. I'll pick it up after the ticket I'm on.",
  "(demo reply) Thanks, noted on my board. This chat is scripted in the demo.",
  "(demo reply) Understood. I'll post progress on the ticket when there is some.",
];

export function demoReply(agent: string, index: number): string {
  const set = DEMO_REPLIES[agent] ?? GENERIC_REPLIES;
  return set[index % set.length] as string;
}

/**
 * A chat message the person sends now, and what follows it in demo time: the postman claims the
 * `dm` delivery after 2 s and forwards it after 5 s, and the agent's scripted reply comes after 8 s.
 * `replies` is how many messages the person had already sent in the thread (it picks the reply).
 * The entries are not cut at the loop end; the source carries them into the next loop.
 */
export function buildDmExchange(
  exchange: { agent: string; from: string; text: string; clientId: string; replies: number },
  fromMs: number,
  firstId: number,
): ScriptEntry[] {
  const { agent, from, text, clientId } = exchange;
  return [
    { id: firstId, at: fromMs, action: { type: "dm", from, agent, text, clientId } },
    { id: firstId + 1, at: fromMs + 2 * SECOND, action: { type: "postman", source: firstId, state: "claimed" } },
    { id: firstId + 2, at: fromMs + 5 * SECOND, action: { type: "postman", source: firstId, state: "forwarded" } },
    {
      id: firstId + 3,
      at: fromMs + 8 * SECOND,
      action: { type: "dmReply", agent, text: demoReply(agent, exchange.replies), replyToClientId: clientId },
    },
  ];
}

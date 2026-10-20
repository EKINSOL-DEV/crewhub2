/**
 * The pure part of `tools/loops-seed.mjs`: what a demo action becomes as a crewhub-loops request, what a lead agent's
 * key may not write (with where loops says so), the URL guard, and the pacing. Nothing here touches the network; the
 * test is `scripts/test/loops-seed.test.ts`.
 *
 * The seed writes as an external bot (role `lead`, scope `agent`), so it may do what a lead agent may: create tickets,
 * move them (never into Done: `domain/tickets.py` `require_human_for_done`), patch them, comment, post progress and add
 * blockers. Projects, agents, labels, milestones, releases and the team snapshot belong to the admin, the probe or the
 * postman; those actions are listed in NOT_REPLAYED with the route that refuses them.
 */
import type { Action } from "../../packages/demo/src/actions.ts";
import type { TicketSeed } from "../../packages/demo/src/content.ts";
import type { ScriptEntry } from "../../packages/demo/src/script.ts";

export type Status = "backlog" | "planned" | "in_progress" | "review" | "done";
export const STATUSES: readonly Status[] = ["backlog", "planned", "in_progress", "review", "done"];

export const DEFAULT_URL = "http://127.0.0.1:8291";
/** The Mac app, `make dev-api` and the nginx https port: never a target, whatever `--url` says. */
export const REFUSED_PORTS: readonly number[] = [8091, 8000, 9443];
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

/** The origin the seed may talk to: plain http, this machine, an explicit port that is not a reserved one. */
export function checkUrl(raw: string): { ok: true; origin: string } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: `not a URL: ${raw}` };
  }
  if (url.protocol !== "http:") return { ok: false, reason: `${url.protocol} is not http: the development loops speaks plain http on loopback` };
  if (!LOCAL_HOSTS.has(url.hostname)) return { ok: false, reason: `${url.hostname} is not this machine: a tool only opens 127.0.0.1 or localhost` };
  if (url.port === "") return { ok: false, reason: "name the port (the development loops listens on 8291)" };
  const port = Number(url.port);
  if (REFUSED_PORTS.includes(port)) return { ok: false, reason: `port ${port} is reserved (the Mac app on 8091, make dev-api on 8000, nginx on 9443): never a seed target` };
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") return { ok: false, reason: "give the origin only, no path" };
  return { ok: true, origin: `${url.protocol}//${url.hostname}:${port}` };
}

const KEY = /^chl_[A-Za-z0-9_-]{20,}$/;

/** A key file's content: one `chl_…` token, whitespace around it ignored. The caller never prints it. */
export function readKey(text: string): string {
  const key = text.trim();
  if (!KEY.test(key)) throw new Error("the key file does not hold one chl_ key");
  return key;
}

/** The actions a lead agent's key replays, and the ones it may not, each with the loops rule that says so. */
export const REPLAYED: readonly Action["type"][] = ["createTicket", "move", "assign", "labels", "waitOn", "block", "comment", "progress"];

export const NOT_REPLAYED: Readonly<Record<string, string>> = {
  lane: "a lane's status is the probe's snapshot (PUT /api/team/snapshot, auth/deps.py PROBE_WRITES)",
  laneJoin: "a lane's status is the probe's snapshot (PUT /api/team/snapshot, auth/deps.py PROBE_WRITES)",
  laneLeave: "a lane's status is the probe's snapshot (PUT /api/team/snapshot, auth/deps.py PROBE_WRITES)",
  probe: "the team snapshot is team-probe's (auth/probe.py PROBE_READ_ROUTES, auth/deps.py PROBE_WRITES)",
  poll: "a read of GET /api/team: nothing to write",
  postman: "deliveries are the router's (auth/write_boundary.py EXEMPT_ROUTES system_role)",
  dm: "the chat needs the person's session (routers/dm.py)",
  dmReply: "a reply is the thread's own agent's (auth/write_boundary.py own_object)",
  dmRead: "a read marker is the person's (routers/dm.py)",
  delegationRequest: "a delegation binds to the owner's own chat message (routers/agents.py require_owner)",
  stall: "stalls are the watchdog's, actor system (domain/watchdog.py)",
  resume: "stalls are the watchdog's, actor system (domain/watchdog.py)",
  milestoneCreate: "milestones need the project's feature flag (admin) and a project-admin right (auth/write_boundary.py project_admin_right)",
  milestoneAttach: "milestones need the project's feature flag (admin) and a project-admin right (auth/write_boundary.py project_admin_right)",
  milestoneState: "milestones need the project's feature flag (admin) and a project-admin right (auth/write_boundary.py project_admin_right)",
  handoff: "a hand-off is a person's (demo actions.ts; routers/milestone_handoff.py)",
  releaseCreate: "releases need the project's feature flag (admin, PUT /api/projects/{slug}/features require_admin_or_lead)",
  releaseRequestPublish: "releases need the project's feature flag (admin, PUT /api/projects/{slug}/features require_admin_or_lead)",
  releasePublish: "releases need the project's feature flag (admin, PUT /api/projects/{slug}/features require_admin_or_lead)",
  archiveDone: "POST /api/projects/{slug}/archive-done is require_human (routers/archive.py)",
  unarchive: "POST /api/tickets/{ref}/unarchive is a person's or the project lead's (routers/archive.py require_human_or_lead)",
  projectCreate: "POST /api/projects is a human admin's (routers/projects.py create_project; domain/projects.py require_human admin=True)",
  projectRestore: "POST /api/projects/{slug}/restore is require_admin_or_lead: a human admin or the crewhub lead's admin-scope key (auth/authorize.py)",
  projectArchive: "POST /api/projects/{slug}/archive is require_admin_or_lead: a human admin or the crewhub lead's admin-scope key (auth/authorize.py)",
  projectUpdate: "PATCH /api/projects/{slug} needs an admin or a project-admin right (auth/write_boundary.py project_admin_right)",
  projectReorder: "PUT /api/projects/order is require_admin (routers/projects.py reorder_projects)",
};

/** What loops refuses an agent for a move into Done: `domain/tickets.py require_human_for_done`, 403 `human_only_done`. */
export const PERSON_ONLY_DONE = "a move into Done is a person's (domain/tickets.py require_human_for_done, 403 human_only_done)";

export type Verdict = { replay: true } | { replay: false; reason: string };

export function classify(type: Action["type"]): Verdict {
  if ((REPLAYED as readonly string[]).includes(type)) return { replay: true };
  const reason = NOT_REPLAYED[type];
  return { replay: false, reason: reason ?? `no mapping for ${type}` };
}

/** What the runtime knows about a ticket in loops (from `GET /api/tickets/{ref}` or a list row). */
export interface TicketRef {
  id: string;
  key: string;
  status: Status;
  version: number;
  assigneeId: string | null;
  waitingOnId: string | null;
  labelIds: string[];
  resolution: string | null;
}

/** How demo names become loops names. A null means "nobody" or "no such label here" and the field is dropped. */
export interface Resolve {
  principal(demoId: string): string | null;
  label(projectSlug: string, name: string): string | null;
}

export interface CreateTicketBody {
  project: string;
  title: string;
  kind: string;
  priority: string;
  status: Status;
  bodyMarkdown: string;
  assigneeId?: string;
  waitingOnId?: string;
  labels?: string[];
}

export interface Built<B> {
  body: B;
  /** What was adapted on the way, for the log. */
  notes: string[];
}

function labelIds(project: string, names: readonly string[] | undefined, resolve: Resolve, notes: string[]): string[] {
  const ids: string[] = [];
  for (const name of names ?? []) {
    const id = resolve.label(project, name);
    if (id === null) notes.push(`label ${name} does not exist in ${project}: dropped`);
    else ids.push(id);
  }
  return ids;
}

function principal(field: string, demoId: string | null | undefined, resolve: Resolve, notes: string[]): string | undefined {
  if (demoId === null || demoId === undefined) return undefined;
  const id = resolve.principal(demoId);
  if (id === null) {
    notes.push(`${field} ${demoId} is no principal here: left empty`);
    return undefined;
  }
  return id;
}

/**
 * The create request for a seed ticket (the installation's picture). A Done seed cannot be made Done by an agent key:
 * it is created in Review and listed for a person (`personOnly`). Archived seeds are not on the board: skipped.
 */
export function seedTicketRequest(
  seed: TicketSeed,
  project: string,
  resolve: Resolve,
): (Built<CreateTicketBody> & { personOnly: Status | null }) | { skip: string } {
  if (seed.archivedInto !== undefined) return { skip: "an archived seed is not on the board" };
  if (seed.carrierOf !== undefined) return { skip: "a release carrier needs the releases feature" };
  if (seed.held === true) return { skip: "a held ticket needs a milestone (feature off)" };
  const notes: string[] = [];
  const body: CreateTicketBody = {
    project,
    title: seed.title,
    kind: seed.kind,
    priority: seed.priority,
    status: seed.status === "done" ? "review" : seed.status,
    bodyMarkdown: seed.body,
  };
  if (seed.status === "done") notes.push(`created in Review: ${PERSON_ONLY_DONE}`);
  const assignee = principal("assignee", seed.assignee, resolve, notes);
  if (assignee !== undefined) body.assigneeId = assignee;
  const waitingOn = principal("waitingOn", seed.waitingOn, resolve, notes);
  if (waitingOn !== undefined) body.waitingOnId = waitingOn;
  const labels = labelIds(project, seed.labels, resolve, notes);
  if (labels.length > 0) body.labels = labels;
  return { body, notes, personOnly: seed.status === "done" ? "done" : null };
}

/** The create request for a storyline `createTicket`. */
export function createTicketRequest(action: Extract<Action, { type: "createTicket" }>, resolve: Resolve): Built<CreateTicketBody> {
  const notes: string[] = [];
  const status = action.status ?? "backlog";
  const body: CreateTicketBody = {
    project: action.project,
    title: action.title,
    kind: action.kind,
    priority: action.priority,
    status: status === "done" ? "review" : status,
    bodyMarkdown: action.body,
  };
  if (status === "done") notes.push(`created in Review: ${PERSON_ONLY_DONE}`);
  const assignee = principal("assignee", action.assignee, resolve, notes);
  if (assignee !== undefined) body.assigneeId = assignee;
  const labels = labelIds(action.project, action.labels, resolve, notes);
  if (labels.length > 0) body.labels = labels;
  return { body, notes };
}

export interface MoveBody {
  version: number;
  status: Status;
  afterId: null;
}

/** A move: nothing when the ticket is already there, a person's when it goes into Done, else the request. */
export function moveRequest(current: TicketRef, to: Status): { skip: string } | { personOnly: string } | { body: MoveBody } {
  if (to === "done") return { personOnly: PERSON_ONLY_DONE };
  if (current.status === to) return { skip: `${current.key} is already ${to}` };
  if (current.resolution === "rejected") return { skip: `${current.key} is Done as won't do: taking that back is a person's (domain/board.py)` };
  return { body: { version: current.version, status: to, afterId: null } };
}

export interface PatchBody {
  version: number;
  assigneeId?: string | null;
  waitingOnId?: string | null;
  labels?: string[];
}

export function assignRequest(current: TicketRef, assignee: string | null, resolve: Resolve): { skip: string } | Built<PatchBody> {
  const notes: string[] = [];
  const id = assignee === null ? null : (principal("assignee", assignee, resolve, notes) ?? null);
  if (id !== null && current.assigneeId === id) return { skip: `${current.key} is already assigned to ${id}` };
  if (id === null && assignee !== null) return { skip: notes.join("; ") };
  if (id === null && current.assigneeId === null) return { skip: `${current.key} is already unassigned` };
  return { body: { version: current.version, assigneeId: id }, notes };
}

export function waitOnRequest(current: TicketRef, on: string | null, resolve: Resolve): { skip: string } | Built<PatchBody> {
  const notes: string[] = [];
  const id = on === null ? null : (principal("waitingOn", on, resolve, notes) ?? null);
  if (id === null && on !== null) return { skip: notes.join("; ") };
  if (current.waitingOnId === id) return { skip: `${current.key} already waits on ${id ?? "nobody"}` };
  return { body: { version: current.version, waitingOnId: id }, notes };
}

export function labelsRequest(current: TicketRef, project: string, names: readonly string[], resolve: Resolve): { skip: string } | Built<PatchBody> {
  const notes: string[] = [];
  const ids = labelIds(project, names, resolve, notes);
  const same = ids.length === current.labelIds.length && ids.every((id) => current.labelIds.includes(id));
  if (same) return { skip: `${current.key} already carries ${ids.length === 0 ? "no label" : "those labels"}` };
  return { body: { version: current.version, labels: ids }, notes };
}

export interface CommentBody {
  bodyMarkdown: string;
  parentId?: string;
}

export function commentRequest(text: string, parentId: string | null): CommentBody {
  return parentId === null ? { bodyMarkdown: text } : { bodyMarkdown: text, parentId };
}

export const PROGRESS_TEXT_MAX = 200;

export interface ProgressBody {
  text: string;
  kind: "start" | "update" | "done" | "question";
}

/** A progress line as loops stores it from the CLI road: the worker's name in front, at most 200 characters. */
export function progressRequest(action: Extract<Action, { type: "progress" }>): ProgressBody {
  const text = action.worker === undefined ? action.text : `${action.worker}: ${action.text}`;
  return { text: text.length > PROGRESS_TEXT_MAX ? text.slice(0, PROGRESS_TEXT_MAX) : text, kind: action.kind };
}

/** A ticket handle in the storyline: a demo key (`CR-21`), or `@<id>` for the ticket the entry `id` created. */
export type Handle = { kind: "key"; key: string } | { kind: "created"; project: string; title: string } | { kind: "missing"; reason: string };

export function resolveHandle(ref: string, entries: readonly ScriptEntry[]): Handle {
  if (!ref.startsWith("@")) return { kind: "key", key: ref };
  const id = Number(ref.slice(1));
  const entry = entries.find((e) => e.id === id);
  if (entry === undefined) return { kind: "missing", reason: `no entry ${id}` };
  if (entry.action.type === "createTicket") return { kind: "created", project: entry.action.project, title: entry.action.title };
  return { kind: "missing", reason: `entry ${id} (${entry.action.type}) is not replayed, so its ticket does not exist` };
}

/**
 * The moves that bring the installed tickets back to their seed picture before another pass of the storyline, so the
 * same pass moves them again. Done seeds stay where a person put them (an agent may not move into Done); a ticket a
 * person set to Done that the seed wants back in Review or earlier is moved out of Done, which an agent may.
 */
export function convergeMoves(
  seeds: readonly TicketSeed[],
  current: (seed: TicketSeed) => TicketRef | null,
): { ticket: TicketRef; to: Status }[] {
  const moves: { ticket: TicketRef; to: Status }[] = [];
  for (const seed of seeds) {
    if (seed.archivedInto !== undefined || seed.carrierOf !== undefined || seed.held === true) continue;
    const ticket = current(seed);
    if (ticket === null) continue;
    const to: Status = seed.status === "done" ? "review" : seed.status;
    if (seed.status === "done" && ticket.status === "done") continue;
    if (ticket.status === to) continue;
    if (ticket.resolution === "rejected") continue;
    moves.push({ ticket, to });
  }
  return moves;
}

/** The wait before each entry at `speed` (1 = the storyline's pace), from the entry before it. */
export function schedule(entries: readonly ScriptEntry[], speed: number): { entry: ScriptEntry; delayMs: number }[] {
  if (!(speed > 0)) throw new Error("speed must be above 0");
  let last = 0;
  return entries.map((entry) => {
    const delayMs = Math.max(0, Math.round((entry.at - last) / speed));
    last = entry.at;
    return { entry, delayMs };
  });
}

export type Result = "done" | "skipped" | "refused" | "person" | "failed";

export interface Outcome {
  id: number;
  type: string;
  result: Result;
  /** The key loops gave, when a ticket was touched. */
  key?: string;
  reason?: string;
}

/** Counts per result, and per reason for everything that was not done. */
export function tally(outcomes: readonly Outcome[]): { results: Record<Result, number>; reasons: Record<string, number> } {
  const results: Record<Result, number> = { done: 0, skipped: 0, refused: 0, person: 0, failed: 0 };
  const reasons: Record<string, number> = {};
  for (const o of outcomes) {
    results[o.result] += 1;
    if (o.result !== "done") {
      const reason = `${o.type}: ${o.reason ?? "?"}`;
      reasons[reason] = (reasons[reason] ?? 0) + 1;
    }
  }
  return { results, reasons };
}

/** "m:ss" for a storyline position. */
export function clock(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// The author: a storyline action is written with its demo author's own key when the seed has one (`--agent-keys`).

/** The demo principal that performs an action (`by`; a progress line's `agent`), or null for actions without one. */
export function actorOf(action: Action): string | null {
  if (action.type === "progress") return action.agent;
  if ("by" in action && typeof action.by === "string") return action.by;
  return null;
}

/** An agent id that is safe as a file name component (loops agent ids are such names). */
const SAFE_ID = /^[a-z0-9][a-z0-9_.-]*$/i;

/** The key file of an agent in `dir`, as the Lead lays them out (`agent-<id>.key`); null for an id no file name should carry. */
export function agentKeyFile(dir: string, agentId: string): string | null {
  if (!SAFE_ID.test(agentId) || agentId.includes("..")) return null;
  return `${dir.replace(/\/+$/, "")}/agent-${agentId}.key`;
}

/** The writer of an action: the actor's own key when the seed holds one, else null (the seed bot writes, as before). */
export function writerFor(actor: string | null, keys: ReadonlyMap<string, string>): { as: string; key: string } | null {
  if (actor === null) return null;
  const key = keys.get(actor);
  return key === undefined ? null : { as: actor, key };
}

/**
 * DemoStore: an in-memory crewhub-loops "server state". It holds the loops read models and the
 * event log, and answers reads in exactly the shapes of read-model.md. Mutations live in
 * `actions.ts`; they change this state and append the envelopes loops would write.
 */
import type {
  ActorRef,
  AgentOut,
  BoardResponse,
  CommentOut,
  DeliveryOut,
  DmMessage,
  DmThread,
  Envelope,
  LabelOut,
  LoopsSnapshot,
  MilestoneRef,
  MilestoneState,
  MilestoneSummary,
  PrincipalOut,
  PrincipalRef,
  ProgressItem,
  ProjectColor,
  ProjectIcon,
  ProjectOut,
  ReleaseRef,
  ReleaseSummary,
  StatusCounts,
  TeamAgent,
  TeamSnapshot,
  Ticket,
  TicketCard,
  TicketKind,
  TicketPriority,
  TicketStatus,
  TicketSummary,
  WatchdogResponse,
} from "@crewhub/loops-client";
import { type DemoContent, type ProjectGroupSeed, type ProjectSeed, SMALL_TEAM } from "./content.ts";
import { DAY, MINUTE, SECOND, iso } from "./time.ts";

export const STATUSES: readonly TicketStatus[] = ["backlog", "planned", "in_progress", "review", "done"];
const STALE_MS = 300 * SECOND;
const WATCHDOG_TICK_MS = 120 * SECOND;
const TICKET_KEY_RE = /\b[A-Z][A-Z0-9]{1,7}-[1-9][0-9]{0,8}\b/;

export interface StoredProject {
  id: string;
  slug: string;
  key: string;
  name: string;
  leadId: string;
  color: ProjectColor;
  icon: ProjectIcon;
  description: string;
  archivedAt: number | null;
  archivedById: string | null;
  revision: number;
  /** FUTURE (proposal L22, not in crewhub-loops today): the project group this project belongs to. */
  groupId: string | null;
  features: { milestones: boolean; releases: boolean; watchdog_nudge: boolean };
  nextTicketNumber: number;
  nextMilestoneNumber: number;
  nextReleaseNumber: number;
}

export interface StallEpisode {
  state: "stalled" | "attention";
  episode: number;
  quietSince: number;
  detectedAt: number;
  nudges: number;
  lastNudgeAt: number | null;
  deliveryRecipientId: string | null;
  deliveryId: string | null;
}

export interface StoredTicket {
  id: string;
  key: string;
  project: string;
  title: string;
  kind: TicketKind;
  status: TicketStatus;
  priority: TicketPriority;
  position: number;
  version: number;
  assigneeId: string | null;
  waitingOnId: string | null;
  labelIds: string[];
  held: boolean;
  milestoneId: string | null;
  /** Ids of blocker tickets (the relation stays; it is active while the blocker is before review). */
  blockedBy: string[];
  createdAt: number;
  updatedAt: number;
  statusChangedAt: number;
  closedAt: number | null;
  /** How a Done ticket closed (CL-89): `rejected` is a person's "won't do", with the reason; null is done as planned. */
  resolution: "rejected" | null;
  resolutionReason: string | null;
  archivedAt: number | null;
  releaseId: string | null;
  createdById: string;
  bodyMarkdown: string;
  stall: StallEpisode | null;
  episodes: number;
}

export interface StoredMilestone {
  id: string;
  project: string;
  number: number;
  title: string;
  state: MilestoneState;
  targetDate: string | null;
  position: number;
  ownerId: string | null;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  completedAt: number | null;
  revision: number;
}

export interface StoredRelease {
  id: string;
  project: string;
  number: number;
  version: string | null;
  title: string;
  state: "draft" | "published";
  carrierId: string;
  requestedLeadId: string;
  createdById: string;
  createdAt: number;
  publishedAt: number | null;
  publishRequestedBy: string | null;
  revision: number;
  memberIds: string[];
}

export interface StoredLane {
  name: string;
  status: string;
  contextLine: string | null;
  paneId: string;
  workspaceId: string;
}

/** Everything a demo loop mutates. Plain data: `structuredClone` copies it. */
export interface DemoState {
  /** The installation this loop started from (the scenario's content); never mutated. */
  content: DemoContent;
  /** Demo time in ms: set by the engine before each action. */
  now: number;
  /** The loop's base instant (script position 0). */
  base: number;
  seq: number;
  counters: Record<string, number>;
  projects: StoredProject[];
  /** Active slugs in sidebar order. */
  order: string[];
  orderRevision: number;
  labels: LabelOut[];
  tickets: StoredTicket[];
  comments: CommentOut[];
  progress: (ProgressItem & { ticketId: string })[];
  milestones: StoredMilestone[];
  releases: StoredRelease[];
  deliveries: DeliveryOut[];
  /** Which script action created each delivery (for the postman actions). */
  deliveryAction: Record<string, number>;
  /** The ticket each script action created (`@<actionId>` refs in the script). */
  actionTickets: Record<number, string>;
  dmThreads: DmThread[];
  dmMessages: DmMessage[];
  /** The demo person's read cursor per thread id: the last message they have read. */
  dmReads: Record<string, string>;
  lanes: StoredLane[];
  team: TeamSnapshot;
  events: Envelope[];
}

/** A project row as loops would hold it right after `at` (the loop start, or the moment it is created). */
export function storedProject(content: DemoContent, p: ProjectSeed, base: number): StoredProject {
  return {
    id: p.id,
    slug: p.slug,
    key: p.key,
    name: p.name,
    leadId: p.leadId,
    color: p.color,
    icon: p.icon,
    description: p.description,
    archivedAt: p.archivedAgo === null ? null : base - p.archivedAgo,
    archivedById: p.archivedAgo === null ? null : DEMO_PERSON,
    revision: 7,
    groupId: p.groupId ?? null,
    features: { ...p.features },
    nextTicketNumber: content.nextTicketNumber[p.key] ?? 1,
    nextMilestoneNumber: 1 + Math.max(0, ...content.milestones.filter((m) => m.project === p.slug).map((m) => m.number)),
    nextReleaseNumber: content.nextReleaseNumber[p.slug] ?? 1,
  };
}

export function initialState(base: number, cursor: number, content: DemoContent = SMALL_TEAM): DemoState {
  const state: DemoState = {
    content,
    now: base,
    base,
    seq: cursor,
    counters: {},
    projects: content.projects.map((p) => storedProject(content, p, base)),
    order: content.projects.filter((p) => p.archivedAgo === null).map((p) => p.slug),
    orderRevision: 3,
    labels: content.labels.map((l) => ({ ...l })),
    tickets: [],
    comments: [],
    progress: [],
    milestones: content.milestones.map((m, index) => ({
      id: m.id,
      project: m.project,
      number: m.number,
      title: m.title,
      state: m.state,
      targetDate: m.targetDate,
      position: index + 1,
      ownerId: m.ownerId,
      createdAt: base - 9 * DAY,
      updatedAt: base - 2 * DAY,
      startedAt: m.state === "active" ? base - 7 * DAY : null,
      completedAt: null,
      revision: 3,
    })),
    releases: [],
    deliveries: [],
    deliveryAction: {},
    actionTickets: {},
    dmThreads: [],
    dmMessages: [],
    dmReads: {},
    lanes: content.lanes.map((l, index) => ({
      name: l.name,
      status: l.status,
      contextLine: l.contextLine,
      paneId: `p${index + 1}`,
      workspaceId: l.workspace ?? "w1",
    })),
    team: { v: 1, ts: "", sessions: [] },
    events: [],
  };
  const project = (key: string): StoredProject => {
    const found = state.projects.find((p) => p.key === key.split("-")[0]);
    if (found === undefined) throw new Error(`No project for ${key}`);
    return found;
  };
  const positions: Record<string, number> = {};
  for (const seed of content.tickets) {
    const p = project(seed.key);
    const number = Number(seed.key.split("-")[1]);
    const createdAgo = seed.createdAgo ?? (8 - (number % 7)) * DAY;
    const closedAt = seed.closedAgo === undefined ? null : base - seed.closedAgo;
    const column = `${p.slug}:${seed.status}`;
    const archived = seed.archivedInto !== undefined;
    const position = archived ? 0 : (positions[column] = (positions[column] ?? 0) + 1);
    const milestone = seed.milestone === undefined ? null : milestoneByKey(state, seed.milestone);
    state.tickets.push({
      id: ticketId(seed.key),
      key: seed.key,
      project: p.slug,
      title: seed.title,
      kind: seed.kind,
      status: seed.status,
      priority: seed.priority,
      position,
      version: 3 + (number % 5),
      assigneeId: seed.assignee ?? null,
      waitingOnId: seed.waitingOn ?? null,
      labelIds: (seed.labels ?? []).map((name) => labelByName(state, name).id),
      held: seed.held ?? false,
      milestoneId: milestone?.id ?? null,
      blockedBy: (seed.blockedBy ?? []).map(ticketId),
      createdAt: base - createdAgo,
      updatedAt: closedAt ?? base - ((number * 7) % 50) * MINUTE - 5 * MINUTE,
      statusChangedAt: closedAt ?? base - ((number * 11) % 90) * MINUTE - 10 * MINUTE,
      closedAt,
      resolution: null,
      resolutionReason: null,
      archivedAt: archived ? base - 20 * 60 * MINUTE : null,
      releaseId: seed.archivedInto ?? seed.carrierOf ?? null,
      createdById: seed.createdBy ?? "nicky",
      bodyMarkdown: seed.body,
      stall: null,
      episodes: 0,
    });
  }
  for (const seed of content.releases) {
    const carrier = requireTicket(state, seed.carrier);
    state.releases.push({
      id: seed.id,
      project: seed.project,
      number: seed.number,
      version: seed.version,
      title: seed.title,
      state: "draft",
      carrierId: carrier.id,
      requestedLeadId: seed.requestedLeadId,
      createdById: "nicky",
      createdAt: carrier.createdAt,
      publishedAt: null,
      publishRequestedBy: null,
      revision: 2,
      memberIds: state.tickets.filter((t) => t.releaseId === seed.id && t.id !== carrier.id).map((t) => t.id),
    });
  }
  for (const seed of content.comments) {
    const ticket = requireTicket(state, seed.ticket);
    const id = nextId(state, "cm");
    state.comments.push(normalComment(state, id, ticket.id, principalRef(state, seed.author), seed.text, base - seed.ago, null));
  }
  for (const seed of content.progress) {
    const ticket = requireTicket(state, seed.ticket);
    state.progress.push({
      ticketId: ticket.id,
      id: nextNumber(state, "progress"),
      agent: principalRef(state, seed.agent),
      kind: seed.kind,
      text: seed.text,
      worker: seed.worker ?? null,
      source: seed.worker === undefined ? "cli" : "herdr",
      createdAt: iso(base - seed.ago),
    });
  }
  for (const seed of content.dmHistory) {
    const thread = dmThread(state, seed.agent, base - seed.ago);
    const at = base - seed.ago;
    const replyTo = seed.author === seed.agent ? (state.dmMessages.at(-1)?.id ?? null) : null;
    const message = dmMessage(state, thread, seed.author, seed.text, at, replyTo);
    if (replyTo === null) {
      message.deliveryState = "forwarded";
      message.state = "answered";
      message.answeredAt = iso(at + 2 * MINUTE);
    } else {
      message.state = "delivered";
    }
    thread.lastMessageAt = iso(at);
    state.dmReads[thread.id] = message.id;
  }
  state.team = uploadSnapshot(state, base - 12 * SECOND);
  return state;
}

// Identifiers

export function ticketId(key: string): string {
  return `tk_demo_${key.toLowerCase().replace("-", "_")}`;
}

export function nextNumber(state: DemoState, counter: string): number {
  const value = (state.counters[counter] ?? 0) + 1;
  state.counters[counter] = value;
  return value;
}

export function nextId(state: DemoState, prefix: string): string {
  return `${prefix}_demo${String(nextNumber(state, prefix)).padStart(4, "0")}`;
}

// Lookups

export function findTicket(state: DemoState, ref: string): StoredTicket | undefined {
  return state.tickets.find((t) => t.key === ref || t.id === ref);
}

export function requireTicket(state: DemoState, ref: string): StoredTicket {
  const ticket = findTicket(state, ref);
  if (ticket === undefined) throw new Error(`Unknown ticket ${ref}`);
  return ticket;
}

export function requireProject(state: DemoState, slug: string): StoredProject {
  const project = state.projects.find((p) => p.slug === slug);
  if (project === undefined) throw new Error(`Unknown project ${slug}`);
  return project;
}

export function milestoneByKey(state: DemoState, key: string): StoredMilestone {
  const found = state.milestones.find((m) => milestoneKey(state, m) === key || m.id === key);
  if (found === undefined) throw new Error(`Unknown milestone ${key}`);
  return found;
}

export function milestoneKey(state: DemoState, m: StoredMilestone): string {
  return `${requireProject(state, m.project).key}-M${m.number}`;
}

export function labelByName(state: DemoState, name: string): LabelOut {
  const found = state.labels.find((l) => l.name === name);
  if (found === undefined) throw new Error(`Unknown label ${name}`);
  return found;
}

/** The person the demo's chat acts as: the admin whose pins, read cursors and messages these are. */
export const DEMO_PERSON = "nicky";

/** `AgentSummaryResponse` of loops' web contract (not in read-model.md). */
export interface AgentSummary {
  comments: { id: string; text: string; createdAt: string; ticketKey: string; url: string }[];
  tickets: { id: string; key: string; title: string; status: TicketStatus; url: string }[];
}

function principals(state: DemoState): PrincipalOut[] {
  return [
    ...state.content.people.map((p): PrincipalOut => ({ id: p.id, kind: "user", displayName: p.displayName })),
    ...state.content.agents.map((a): PrincipalOut => ({ id: a.id, kind: "agent", displayName: a.displayName })),
  ];
}

export function principalRef(state: DemoState, id: string): PrincipalRef {
  if (id === "system") return { id: "system", kind: "system", displayName: "System" };
  const found = principals(state).find((p) => p.id === id);
  if (found === undefined) throw new Error(`Unknown principal ${id}`);
  return { ...found };
}

export function actorRef(state: DemoState, id: string): ActorRef {
  const ref = principalRef(state, id);
  return { id: ref.id, kind: ref.kind };
}

export function isLeadAgent(state: DemoState, id: string | null): boolean {
  return id !== null && state.content.agents.some((a) => a.id === id && a.role === "lead");
}

export function isAgent(state: DemoState, id: string): boolean {
  return state.content.agents.some((a) => a.id === id);
}

// Construction helpers shared with the actions

export function richBody(text: string): { v: 1; doc: Record<string, unknown> } {
  return {
    v: 1,
    doc: {
      type: "doc",
      content: text.split("\n\n").map((paragraph) => ({
        type: "paragraph",
        content: [{ type: "text", text: paragraph }],
      })),
    },
  };
}

export function normalComment(
  state: DemoState,
  id: string,
  ticketId: string,
  author: PrincipalRef,
  text: string,
  at: number,
  parentId: string | null,
): CommentOut {
  const parent = parentId === null ? undefined : state.comments.find((c) => c.id === parentId);
  return {
    id,
    ticketId,
    parentId,
    rootId: parent?.rootId ?? id,
    author,
    kind: "normal",
    systemCode: null,
    deliveryId: null,
    body: richBody(text),
    bodyMarkdown: text,
    attachments: [],
    createdAt: iso(at),
    editedAt: null,
    deletedAt: null,
  };
}

export function dmThread(state: DemoState, agentId: string, at: number): DmThread {
  let thread = state.dmThreads.find((t) => t.agentId === agentId);
  if (thread === undefined) {
    thread = { id: `dt_demo_${agentId}`, agentId, createdAt: iso(at), lastMessageAt: iso(at), unreadCount: 0 };
    state.dmThreads.push(thread);
  }
  return thread;
}

export function dmMessage(
  state: DemoState,
  thread: DmThread,
  authorId: string,
  text: string,
  at: number,
  replyTo: string | null,
  clientId?: string,
): DmMessage {
  const id = nextId(state, "dm");
  const message: DmMessage = {
    id,
    threadId: thread.id,
    author: principalRef(state, authorId),
    body: richBody(text),
    bodyMarkdown: text,
    bodyText: text,
    replyTo,
    clientId: clientId ?? `demo-${id}`,
    createdAt: iso(at),
    deliveryId: null,
    deliveryState: null,
    deliveryError: null,
    answeredAt: null,
    state: "queued",
  };
  state.dmMessages.push(message);
  return message;
}

/** Messages in the thread not written by the demo person, after their read cursor. */
export function unreadCount(state: DemoState, threadId: string): number {
  const messages = state.dmMessages.filter((m) => m.threadId === threadId);
  const cursor = messages.findIndex((m) => m.id === state.dmReads[threadId]);
  return messages.slice(cursor + 1).filter((m) => m.author.id !== DEMO_PERSON).length;
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** The snapshot the probe would upload now: the live lanes, `lead` added by the stem rule. */
export function uploadSnapshot(state: DemoState, at: number): TeamSnapshot {
  const registered = new Set(state.content.agents.map((a) => a.id));
  const leads = state.lanes.map((l) => l.name).filter((n) => registered.has(n) && n.endsWith("-lead"));
  const agents = state.lanes.map((lane): TeamAgent => {
    let lead: string | null = null;
    if (!registered.has(lane.name)) {
      let best = "";
      for (const candidate of leads) {
        const stem = candidate.slice(0, -"-lead".length);
        if (lane.name.startsWith(`${stem}-`) && stem.length > best.length) {
          best = stem;
          lead = candidate;
        }
      }
    }
    return {
      name: lane.name,
      status: lane.status,
      paneId: lane.paneId,
      workspaceId: lane.workspaceId,
      contextLine: lane.contextLine,
      lead,
      unsentInput: null,
    };
  });
  return { v: 1, ts: iso(at), sessions: [{ name: state.content.session, agents }] };
}

// Reads

export class DemoReads {
  readonly state: DemoState;

  constructor(state: DemoState) {
    this.state = state;
  }

  private teamFresh(): boolean {
    const ts = Date.parse(this.state.team.ts);
    return Number.isFinite(ts) && this.state.now - ts <= STALE_MS;
  }

  private agentWorking(t: StoredTicket): boolean {
    if (t.status !== "in_progress" || t.assigneeId === null || !isAgent(this.state, t.assigneeId)) return false;
    if (!this.teamFresh()) return false;
    const agents = this.state.team.sessions.flatMap((s) => s.agents);
    if (agents.some((a) => a.name === t.assigneeId && a.status === "working")) return true;
    return agents.some((a) => {
      if (a.lead !== t.assigneeId || a.status !== "working") return false;
      const key = TICKET_KEY_RE.exec(a.contextLine ?? "")?.[0];
      return key === undefined || key === t.key;
    });
  }

  private blockers(t: StoredTicket): StoredTicket[] {
    return t.blockedBy.map((id) => requireTicket(this.state, id));
  }

  private isBlocking(blocker: StoredTicket): boolean {
    return blocker.archivedAt === null && blocker.status !== "review" && blocker.status !== "done";
  }

  milestoneRef(id: string | null): MilestoneRef | null {
    if (id === null) return null;
    const m = milestoneByKey(this.state, id);
    return { id: m.id, key: milestoneKey(this.state, m), number: m.number, title: m.title, state: m.state };
  }

  private releaseRef(id: string | null): ReleaseRef | null {
    const r = this.state.releases.find((x) => x.id === id);
    if (r === undefined) return null;
    return { id: r.id, number: r.number, version: r.version, title: r.title, state: r.state, deletedAt: null };
  }

  card(t: StoredTicket): TicketCard {
    return {
      id: t.id,
      key: t.key,
      title: t.title,
      kind: t.kind,
      status: t.status,
      resolution: t.resolution,
      resolutionReason: t.resolutionReason,
      priority: t.priority,
      position: t.position,
      version: t.version,
      assignee: t.assigneeId === null ? null : principalRef(this.state, t.assigneeId),
      waitingOn: t.waitingOnId === null ? null : principalRef(this.state, t.waitingOnId),
      labels: t.labelIds.map((id) => ({ ...(this.state.labels.find((l) => l.id === id) as LabelOut) })),
      commentCount: this.state.comments.filter((c) => c.ticketId === t.id && c.kind === "normal").length,
      attachmentCount: 0,
      agentWorking: this.agentWorking(t),
      stall:
        t.stall === null || t.status !== "in_progress"
          ? null
          : { state: t.stall.state, quietSince: iso(t.stall.quietSince), nudges: t.stall.nudges },
      waitingOnHuman: t.status === "in_progress" && t.waitingOnId !== null && !isAgent(this.state, t.waitingOnId),
      milestone: this.milestoneRef(t.milestoneId),
      held: t.held,
      blocked: this.blockers(t).some((b) => this.isBlocking(b)),
      updatedAt: iso(t.updatedAt),
      statusChangedAt: iso(t.statusChangedAt),
      links: [],
    };
  }

  summary(t: StoredTicket): TicketSummary {
    const project = requireProject(this.state, t.project);
    return {
      ...this.card(t),
      project: { slug: project.slug, key: project.key },
      createdAt: iso(t.createdAt),
      closedAt: t.closedAt === null ? null : iso(t.closedAt),
    };
  }

  private stallDetail(t: StoredTicket): NonNullable<Ticket["stallDetail"]> | null {
    if (t.stall === null || t.status !== "in_progress" || t.archivedAt !== null) return null;
    const s = t.stall;
    return {
      state: s.state,
      quietSince: iso(s.quietSince),
      detectedAt: iso(s.detectedAt),
      quietMinutes: Math.max(0, Math.floor((this.state.now - s.quietSince) / MINUTE)),
      nudges: s.nudges,
      lastNudgeAt: s.lastNudgeAt === null ? null : iso(s.lastNudgeAt),
      deliveryRecipientId: s.deliveryRecipientId,
      escalatedAt: null,
      escalationOutcome: null,
    };
  }

  ticket(ref: string): Ticket | null {
    const t = findTicket(this.state, ref);
    if (t === undefined) return null;
    const { links: _links, ...summary } = this.summary(t);
    const relation = (other: StoredTicket, active: boolean) => ({
      id: other.id,
      key: other.key,
      title: other.title,
      status: other.status,
      active,
    });
    return {
      ...summary,
      archivedAt: t.archivedAt === null ? null : iso(t.archivedAt),
      release: this.releaseRef(t.releaseId),
      stallDetail: this.stallDetail(t),
      blockedBy: this.blockers(t).map((b) => relation(b, this.isBlocking(b))),
      blocking: this.state.tickets
        .filter((other) => other.blockedBy.includes(t.id))
        .map((other) => relation(other, this.isBlocking(t))),
      links: [],
      body: richBody(t.bodyMarkdown),
      bodyMarkdown: t.bodyMarkdown,
      attachments: [],
      createdBy: principalRef(this.state, t.createdById),
      seedId: null,
    };
  }

  private liveTickets(slug: string): StoredTicket[] {
    return this.state.tickets.filter((t) => t.project === slug && t.archivedAt === null);
  }

  private inDoneWindow(t: StoredTicket): boolean {
    return t.status !== "done" || (t.closedAt !== null && this.state.now - t.closedAt <= 30 * DAY);
  }

  counts(slug: string): StatusCounts {
    const counts: StatusCounts = { backlog: 0, planned: 0, in_progress: 0, review: 0, done: 0 };
    for (const t of this.liveTickets(slug)) if (this.inDoneWindow(t)) counts[t.status] += 1;
    return counts;
  }

  project(slug: string): ProjectOut | null {
    const p = this.state.projects.find((x) => x.slug === slug);
    if (p === undefined) return null;
    return {
      id: p.id,
      slug: p.slug,
      key: p.key,
      name: p.name,
      lead: principalRef(this.state, p.leadId),
      herdrSession: null,
      counts: this.counts(slug),
      releaseScheme: p.features.releases ? "semver" : null,
      releaseRepo: p.features.releases ? `ekinsol/${p.slug}` : null,
      appNote: "none",
      rootFolder: null,
      extraFolders: [],
      revision: p.revision,
      color: p.color,
      icon: p.icon,
      description: p.description,
      archivedAt: p.archivedAt === null ? null : iso(p.archivedAt),
      archivedBy: p.archivedById === null ? null : principalRef(this.state, p.archivedById),
      effectiveRoute: { agent: p.leadId, session: this.state.content.session, source: "agent" },
      repoCount: 1,
      ticketTotal: this.state.tickets.filter((t) => t.project === slug).length,
      keyLocked: true,
      // FUTURE (proposal L22): absent in crewhub-loops today, so absent here unless the scenario has groups.
      ...(p.groupId === null ? {} : { groupId: p.groupId }),
    };
  }

  /** FUTURE (proposal L22): `GET /api/project-groups`. Crewhub-loops has no such route today. */
  projectGroups(): ProjectGroupSeed[] {
    return this.state.content.groups.map((g) => ({ ...g })).sort((a, b) => a.order - b.order);
  }

  projects(): ProjectOut[] {
    return this.state.order.map((slug) => this.project(slug) as ProjectOut);
  }

  archivedProjects(): ProjectOut[] {
    return this.state.projects.filter((p) => p.archivedAt !== null).map((p) => this.project(p.slug) as ProjectOut);
  }

  board(slug: string): BoardResponse | null {
    if (!this.state.projects.some((p) => p.slug === slug)) return null;
    const live = this.liveTickets(slug).filter((t) => this.inDoneWindow(t));
    return {
      columns: STATUSES.map((status) => ({
        status,
        tickets: live
          .filter((t) => t.status === status)
          .sort((a, b) => a.position - b.position || a.key.localeCompare(b.key))
          .map((t) => this.card(t)),
      })),
    };
  }

  team(): TeamSnapshot {
    return structuredClone(this.state.team);
  }

  agents(): AgentOut[] {
    // Archived projects are left out of both lists, as in loops (`domain/agents.py`, `agent_extras`).
    const active = this.state.projects.filter((p) => p.archivedAt === null);
    const ref = (p: StoredProject) => ({ slug: p.slug, key: p.key });
    return this.state.content.agents.map((a) => ({
      id: a.id,
      displayName: a.displayName,
      role: a.role,
      herdrSession: this.state.content.session,
      disabled: false,
      lastSeenAt: iso(this.state.now - 40 * SECOND),
      keys: null,
      isCrewhubLead: a.isCrewhubLead,
      successorId: null,
      projects: {
        lead: active.filter((p) => p.leadId === a.id).map(ref),
        member: active.filter((p) => a.memberOf.includes(p.slug)).map(ref),
      },
      lane: null,
      rights: [],
      revision: 1,
    }));
  }

  principals(): PrincipalOut[] {
    return principals(this.state);
  }

  watchdog(): WatchdogResponse {
    const open = this.state.tickets
      .filter((t) => t.stall !== null && t.status === "in_progress" && t.archivedAt === null)
      .sort((a, b) => (a.stall?.quietSince ?? 0) - (b.stall?.quietSince ?? 0));
    const sinceStart = this.state.now - this.state.base + 90 * SECOND;
    const pending = this.state.deliveries.filter((d) => d.state === "pending");
    const oldest = pending.reduce((min, d) => Math.min(min, Date.parse(d.createdAt)), Infinity);
    return {
      mode: "nudge",
      lastTickAt: iso(this.state.now - (((sinceStart % WATCHDOG_TICK_MS) + WATCHDOG_TICK_MS) % WATCHDOG_TICK_MS)),
      stopped: false,
      lastError: null,
      monitoring: this.teamFresh() ? "ok" : "unavailable:snapshot_stale",
      transport: {
        oldestPendingDeliveryS: Number.isFinite(oldest) ? Math.floor((this.state.now - oldest) / SECOND) : null,
        unsentNotifications: 0,
        inputObstructed: 0,
      },
      openStalled: open.filter((t) => t.stall?.state === "stalled").length,
      openAttention: open.filter((t) => t.stall?.state === "attention").length,
      open: open.map((t) => ({
        ticket: this.summary(t),
        stall: this.stallDetail(t) as NonNullable<Ticket["stallDetail"]>,
      })),
    };
  }

  milestones(slug: string): MilestoneSummary[] {
    return this.state.milestones
      .filter((m) => m.project === slug)
      .sort((a, b) => a.position - b.position)
      .map((m) => {
        const p = requireProject(this.state, m.project);
        return {
          id: m.id,
          key: milestoneKey(this.state, m),
          number: m.number,
          title: m.title,
          state: m.state,
          project: { slug: p.slug, key: p.key },
          targetDate: m.targetDate,
          position: m.position,
          owner: m.ownerId === null ? null : principalRef(this.state, m.ownerId),
          createdAt: iso(m.createdAt),
          updatedAt: iso(m.updatedAt),
          startedAt: m.startedAt === null ? null : iso(m.startedAt),
          completedAt: m.completedAt === null ? null : iso(m.completedAt),
          archivedAt: null,
          revision: m.revision,
        };
      });
  }

  releases(slug: string): ReleaseSummary[] {
    return this.state.releases
      .filter((r) => r.project === slug)
      .sort((a, b) => b.number - a.number)
      .map((r) => {
        const p = requireProject(this.state, r.project);
        return {
          id: r.id,
          number: r.number,
          version: r.version,
          title: r.title,
          state: r.state,
          deletedAt: null,
          project: { slug: p.slug, key: p.key },
          ticketCount: r.memberIds.length,
          createdAt: iso(r.createdAt),
          publishedAt: r.publishedAt === null ? null : iso(r.publishedAt),
          githubTagUrl: null,
          tagSha: null,
          appNote: { state: "n/a", url: null, reason: null },
        };
      });
  }

  comments(ref: string): CommentOut[] {
    const t = findTicket(this.state, ref);
    if (t === undefined) return [];
    return structuredClone(this.state.comments.filter((c) => c.ticketId === t.id));
  }

  /** Newest first, as `GET /api/tickets/{ref}/progress`. */
  progress(ref: string): ProgressItem[] {
    const t = findTicket(this.state, ref);
    if (t === undefined) return [];
    return this.state.progress
      .filter((p) => p.ticketId === t.id)
      .map(({ ticketId: _ticketId, ...item }) => ({ ...item, agent: { ...item.agent } }))
      .reverse();
  }

  /** As the demo person sees them: newest first, `unreadCount` from their read cursor (dm.py `list_threads`). */
  dmThreads(): DmThread[] {
    return this.state.dmThreads
      .map((thread) => ({ ...thread, unreadCount: unreadCount(this.state, thread.id) }))
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt) || a.id.localeCompare(b.id));
  }

  /**
   * `GET /api/agents/{name}/summary` (dm.py `summary`): the agent's five newest normal comments
   * and its open tickets in active projects, newest update first. `baseUrl` stands for loops' public URL.
   */
  agentSummary(agentId: string, baseUrl: string): AgentSummary {
    const base = baseUrl.replace(/\/+$/, "");
    const keyOf = (ticketId: string) => this.state.tickets.find((t) => t.id === ticketId)?.key ?? "";
    const comments = this.state.comments
      .filter((c) => c.author.id === agentId && c.kind === "normal" && !c.deletedAt)
      .slice(-5)
      .reverse()
      .map((c) => ({
        id: c.id,
        text: clip(c.bodyMarkdown ?? "", 140),
        createdAt: c.createdAt,
        ticketKey: keyOf(c.ticketId),
        url: `${base}/t/${keyOf(c.ticketId)}#c-${c.id}`,
      }));
    const archived = new Set(this.state.projects.filter((p) => p.archivedAt !== null).map((p) => p.slug));
    const tickets = this.state.tickets
      .filter((t) => t.assigneeId === agentId && t.status !== "done" && t.archivedAt === null && !archived.has(t.project))
      .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))
      .map((t) => ({ id: t.id, key: t.key, title: t.title, status: t.status, url: `${base}/t/${t.key}` }));
    return { comments, tickets };
  }

  /** Oldest first. */
  dmMessages(agentId: string): DmMessage[] {
    const thread = this.state.dmThreads.find((t) => t.agentId === agentId);
    if (thread === undefined) return [];
    return structuredClone(this.state.dmMessages.filter((m) => m.threadId === thread.id));
  }

  deliveries(): DeliveryOut[] {
    return structuredClone(this.state.deliveries);
  }

  snapshot(): LoopsSnapshot {
    const featured = (feature: "milestones" | "releases") =>
      this.state.projects.filter((p) => p.archivedAt === null && p.features[feature]).map((p) => p.slug);
    return {
      cursor: this.state.seq,
      projects: this.projects(),
      archivedProjects: this.archivedProjects(),
      boards: Object.fromEntries(this.state.order.map((slug) => [slug, this.board(slug) as BoardResponse])),
      team: this.team(),
      agents: this.agents(),
      principals: this.principals(),
      watchdog: this.watchdog(),
      milestones: Object.fromEntries(featured("milestones").map((slug) => [slug, this.milestones(slug)])),
      releases: Object.fromEntries(featured("releases").map((slug) => [slug, this.releases(slug)])),
      // FUTURE (proposal L22): absent in crewhub-loops today, so absent here unless the scenario has groups.
      ...(this.state.content.groups.length === 0 ? {} : { groups: this.projectGroups() }),
    };
  }
}

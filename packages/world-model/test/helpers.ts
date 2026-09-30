/** Builders for world-model tests: a small loops world, a fake source and a manual scheduler. */
import type {
  AgentOut,
  BoardResponse,
  Envelope,
  LoopsSnapshot,
  MilestoneSummary,
  PrincipalRef,
  ProjectOut,
  ReleaseSummary,
  TeamAgent,
  TeamSnapshot,
  Ticket,
  TicketCard,
  TicketStatus,
} from "@crewhub/loops-client";
import type { ProjectionSource, Scheduler } from "../src/projection.ts";

export const T0 = Date.parse("2026-10-01T20:00:00Z");
export const iso = (ms: number): string => new Date(ms).toISOString();

export const agentRef = (id: string): PrincipalRef => ({ id, kind: "agent", displayName: id });
export const userRef = (id: string, displayName: string): PrincipalRef => ({ id, kind: "user", displayName });

export function project(slug: string, key: string, lead: string, extra: Partial<ProjectOut> = {}): ProjectOut {
  return {
    id: `pr_${slug}`,
    slug,
    key,
    name: `${key} project`,
    lead: agentRef(lead),
    counts: { backlog: 0, planned: 0, in_progress: 0, review: 0, done: 0 },
    color: "coral",
    icon: "bot",
    effectiveRoute: { agent: lead },
    ...extra,
  };
}

export function card(id: string, key: string, status: TicketStatus, extra: Partial<TicketCard> = {}): TicketCard {
  return {
    id,
    key,
    title: `Ticket ${key}`,
    kind: "task",
    status,
    priority: "normal",
    position: 1,
    version: 1,
    updatedAt: iso(T0),
    statusChangedAt: iso(T0),
    ...extra,
  };
}

export function board(cards: TicketCard[]): BoardResponse {
  const statuses: TicketStatus[] = ["backlog", "planned", "in_progress", "review", "done"];
  return { columns: statuses.map((status) => ({ status, tickets: cards.filter((c) => c.status === status) })) };
}

export function ticketFrom(c: TicketCard, slug: string, key: string, extra: Partial<Ticket> = {}): Ticket {
  const { links: _links, ...rest } = c;
  return {
    ...rest,
    project: { slug, key },
    createdAt: iso(T0),
    createdBy: userRef("nicky", "Nicky"),
    ...extra,
  };
}

export function registered(id: string, role = "lead", extra: Partial<AgentOut> = {}): AgentOut {
  return { id, displayName: id, role, herdrSession: "ekinsol", disabled: false, lastSeenAt: null, keys: null, ...extra };
}

export function lane(name: string, status: string, extra: Partial<TeamAgent> = {}): TeamAgent {
  return { name, status, contextLine: null, lead: null, ...extra };
}

export function team(ts: number, agents: TeamAgent[]): TeamSnapshot {
  return { v: 1, ts: iso(ts), sessions: [{ name: "ekinsol", agents }] };
}

export interface WorldInput {
  cursor?: number;
  projects: ProjectOut[];
  archivedProjects?: ProjectOut[];
  boards?: Record<string, BoardResponse>;
  team?: TeamSnapshot;
  agents?: AgentOut[];
  milestones?: Record<string, MilestoneSummary[]>;
  releases?: Record<string, ReleaseSummary[]>;
}

export function snapshot(input: WorldInput): LoopsSnapshot {
  return {
    cursor: input.cursor ?? 100,
    projects: input.projects,
    archivedProjects: input.archivedProjects ?? [],
    boards: input.boards ?? {},
    team: input.team ?? team(T0, []),
    agents: input.agents ?? [],
    principals: [],
    watchdog: { mode: "observe", open: [] },
    milestones: input.milestones ?? {},
    releases: input.releases ?? {},
  };
}

let nextSeq = 1000;
export function envelope(
  type: string,
  payload: Record<string, unknown>,
  extra: Partial<Omit<Envelope, "type" | "payload">> = {},
): Envelope {
  nextSeq += 1;
  return {
    v: 1,
    seq: nextSeq,
    ts: iso(T0),
    type,
    project: { slug: "crewhub-loops", key: "CL" },
    ticket: null,
    actor: { id: "cl-lead", kind: "agent" },
    recipientIds: [],
    payload,
    ...extra,
  };
}

/** A scheduler whose time only moves when the test calls `advance`. */
export class ManualScheduler implements Scheduler {
  private time = 0;
  private timers: { at: number; callback: () => void; id: number }[] = [];
  private ids = 0;

  setTimeout(callback: () => void, ms: number): unknown {
    this.ids += 1;
    this.timers.push({ at: this.time + ms, callback, id: this.ids });
    return this.ids;
  }

  clearTimeout(handle: unknown): void {
    this.timers = this.timers.filter((timer) => timer.id !== handle);
  }

  /** Moves time forward, fires due timers and lets their promises settle. */
  async advance(ms: number): Promise<void> {
    this.time += ms;
    const due = this.timers.filter((timer) => timer.at <= this.time);
    this.timers = this.timers.filter((timer) => timer.at > this.time);
    for (const timer of due) timer.callback();
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  }
}

/** A source that answers refetches from maps and counts the calls. */
export class FakeSource implements ProjectionSource {
  clock = T0;
  tickets = new Map<string, Ticket | null>();
  projects = new Map<string, ProjectOut>();
  boards = new Map<string, BoardResponse>();
  milestones = new Map<string, MilestoneSummary[]>();
  releases = new Map<string, ReleaseSummary[]>();
  calls: string[] = [];

  now(): number {
    return this.clock;
  }
  async getTicket(ref: string): Promise<Ticket | null> {
    this.calls.push(`ticket:${ref}`);
    return this.tickets.get(ref) ?? null;
  }
  async getProject(slug: string): Promise<ProjectOut | null> {
    this.calls.push(`project:${slug}`);
    return this.projects.get(slug) ?? null;
  }
  async getBoard(slug: string): Promise<BoardResponse | null> {
    this.calls.push(`board:${slug}`);
    return this.boards.get(slug) ?? null;
  }
  async getMilestones(slug: string): Promise<MilestoneSummary[]> {
    this.calls.push(`milestones:${slug}`);
    return this.milestones.get(slug) ?? [];
  }
  async getReleases(slug: string): Promise<ReleaseSummary[]> {
    this.calls.push(`releases:${slug}`);
    return this.releases.get(slug) ?? [];
  }
}

/**
 * The projection: `SourceMessage`s in, `Facts` out. It never knows whether its source is the demo
 * or a live host. Events are applied idempotently and in order (drop `seq <= cursor`); thin events
 * queue one coalesced refetch per object (plan 3.3: within 250 ms) through the source.
 */
import { TICKET_STATUSES, toWorldEvent, validateEnvelope } from "@crewhub/loops-client";
import type {
  Envelope,
  ProjectOut,
  SourceMessage,
  Ticket,
  TicketCard,
  WorldEvent,
  WorldSource,
} from "@crewhub/loops-client";
import { emptyFacts, parseTs } from "./facts.ts";
import type { CardFact, Facts } from "./facts.ts";

/** What the projection needs from a source: its clock and the refetch reads. */
export type ProjectionSource = Pick<
  WorldSource,
  "now" | "getTicket" | "getProject" | "getBoard" | "getMilestones" | "getReleases"
>;

export interface Scheduler {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface ProjectionOptions {
  scheduler?: Scheduler;
  /** Refetches of one object requested within this window become one read. Default 250 ms. */
  coalesceMs?: number;
}

const HISTORY_CAP = 300;
const DELIVERY_CAP = 500;

const defaultScheduler: Scheduler = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
};

export class Projection {
  private state: Facts = emptyFacts();
  private readonly source: ProjectionSource;
  private readonly scheduler: Scheduler;
  private readonly coalesceMs: number;
  private readonly listeners = new Set<() => void>();
  private readonly pending = new Map<string, unknown>();
  /** Bumped by a snapshot so refetches started before it are discarded. */
  private epoch = 0;

  constructor(source: ProjectionSource, options: ProjectionOptions = {}) {
    this.source = source;
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.coalesceMs = options.coalesceMs ?? 250;
  }

  /** The current facts. Owned by the projection and patched in place; `version` changes on each change. */
  get facts(): Readonly<Facts> {
    return this.state;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Cancels queued refetches; results still in flight are ignored. */
  dispose(): void {
    for (const handle of this.pending.values()) this.scheduler.clearTimeout(handle);
    this.pending.clear();
    this.epoch += 1;
    this.listeners.clear();
  }

  /** Applies one source message; returns true when the facts changed. */
  apply(message: SourceMessage): boolean {
    let changed = false;
    switch (message.type) {
      case "snapshot":
        this.loadSnapshot(message.snapshot);
        changed = true;
        break;
      case "event":
        changed = this.applyEnvelope(message.envelope);
        break;
      case "heartbeat":
        // events.md: a heartbeat's seq is never ahead of the last envelope, so storing it skips nothing.
        if (message.seq > this.state.cursor) {
          this.state.cursor = message.seq;
          changed = true;
        }
        break;
      case "team":
        this.state.team = message.team;
        this.state.teamReceivedAt = this.source.now();
        this.state.teamRevision += 1;
        changed = true;
        break;
    }
    if (changed) this.changed();
    return changed;
  }

  private changed(): void {
    this.state.version += 1;
    for (const listener of this.listeners) listener();
  }

  private loadSnapshot(snapshot: Extract<SourceMessage, { type: "snapshot" }>["snapshot"]): void {
    for (const handle of this.pending.values()) this.scheduler.clearTimeout(handle);
    this.pending.clear();
    this.epoch += 1;
    const facts = emptyFacts();
    facts.loaded = true;
    facts.version = this.state.version;
    facts.cursor = snapshot.cursor;
    for (const project of snapshot.projects) {
      facts.projects[project.slug] = project;
      facts.order.push(project.slug);
    }
    for (const project of snapshot.archivedProjects) {
      facts.projects[project.slug] = project;
      facts.archivedOrder.push(project.slug);
    }
    for (const [slug, board] of Object.entries(snapshot.boards)) {
      for (const column of board.columns) {
        for (const card of column.tickets) facts.cards[card.id] = { slug, card };
      }
    }
    facts.team = snapshot.team;
    facts.teamReceivedAt = this.source.now();
    facts.teamRevision = this.state.teamRevision + 1;
    facts.snapshots = this.state.snapshots + 1;
    facts.agents = snapshot.agents;
    facts.principals = snapshot.principals;
    facts.watchdog = snapshot.watchdog;
    for (const item of snapshot.watchdog.open ?? []) {
      facts.stalls[item.ticket.key] = {
        ticketKey: item.ticket.key,
        state: item.stall.state,
        quietSince: item.stall.quietSince,
        quietMinutes: item.stall.quietMinutes,
        agent: item.ticket.assignee?.id ?? null,
        blockedMember: null,
        nudges: item.stall.nudges ?? 0,
      };
    }
    facts.milestones = { ...snapshot.milestones };
    facts.releases = { ...snapshot.releases };
    this.state = facts;
  }

  private applyEnvelope(input: Envelope): boolean {
    const checked = validateEnvelope(input);
    if (!checked.ok) {
      // A readable seq still orders it: a duplicate is dropped, and a new one advances the cursor
      // because replaying a broken envelope cannot fix it.
      const seq = (input as { seq?: unknown }).seq;
      const hasSeq = typeof seq === "number" && Number.isInteger(seq);
      if (hasSeq && seq <= this.state.cursor) return false;
      if (hasSeq) this.state.cursor = seq;
      this.state.invalidEvents += 1;
      return true;
    }
    const envelope = checked.value;
    if (envelope.seq <= this.state.cursor) return false;
    this.state.cursor = envelope.seq;
    const event = toWorldEvent(envelope);
    if (event === null) {
      this.state.skippedEvents += 1;
      return true;
    }
    if (!event.ok) {
      this.state.invalidEvents += 1;
      return true;
    }
    this.applyEvent(event.value);
    return true;
  }

  private applyEvent(event: WorldEvent): void {
    const facts = this.state;
    const ts = parseTs(event.ts, this.source.now());
    const slug = event.project?.slug ?? null;
    switch (event.type) {
      case "ticket.created": {
        if (!event.ticket || !slug) return;
        if (!facts.cards[event.ticket.id]) {
          // A provisional card until the refetch answers: the object appears in the room of its status.
          facts.cards[event.ticket.id] = {
            slug,
            card: {
              id: event.ticket.id,
              key: event.ticket.key,
              title: event.ticket.title,
              kind: event.payload.kind,
              status: event.payload.status,
              priority: "normal",
              position: this.nextPosition(slug, event.payload.status),
              version: 0,
              updatedAt: event.ts,
              statusChangedAt: event.ts,
            },
          };
          this.recount(slug);
        }
        this.refetchTicket(event.ticket.id);
        return;
      }
      case "ticket.updated":
      case "ticket.unarchived":
      case "comment.updated":
      case "comment.deleted": {
        if (event.type === "ticket.unarchived" && slug) {
          facts.archivedTickets[slug] = Math.max(0, (facts.archivedTickets[slug] ?? 0) - 1);
        }
        if (event.type === "ticket.unarchived" && event.ticket) {
          pushCapped(facts.unarchives, { seq: event.seq, ts, slug, ticketId: event.ticket.id, ticketKey: event.ticket.key, card: null });
        }
        if (event.ticket) this.refetchTicket(event.ticket.id);
        return;
      }
      case "comment.created": {
        if (!event.ticket) return;
        pushCapped(facts.comments, {
          seq: event.seq,
          ts,
          slug,
          ticketId: event.ticket.id,
          ticketKey: event.ticket.key,
          actorId: event.actor.id,
          actorKind: event.actor.kind,
        });
        this.refetchTicket(event.ticket.id);
        return;
      }
      case "ticket.moved": {
        if (!event.ticket) return;
        const fact = facts.cards[event.ticket.id];
        facts.lastMoves[event.ticket.id] = {
          seq: event.seq,
          ts,
          slug,
          ticketKey: event.ticket.key,
          actorId: event.actor.id,
          actorKind: event.actor.kind,
          from: event.payload.from,
          to: event.payload.to,
          reason: event.payload.reason ?? null,
        };
        if (!fact) {
          this.refetchTicket(event.ticket.id);
          return;
        }
        const card: TicketCard = { ...fact.card, status: event.payload.to, position: event.payload.position };
        if (event.payload.from !== event.payload.to) card.statusChangedAt = event.ts;
        if (event.payload.waitingOnCleared) {
          card.waitingOn = null;
          card.waitingOnHuman = false;
        }
        if (event.payload.labelsCleared) card.labels = [];
        if (event.payload.to !== "in_progress") card.stall = null;
        facts.cards[event.ticket.id] = { slug: fact.slug, card };
        this.recount(fact.slug);
        // Renumbered siblings and hand-off side effects are not in the payload.
        if (event.payload.renumbered || event.payload.code) this.refetchTicket(event.ticket.id);
        return;
      }
      case "ticket.archived": {
        if (!event.ticket) return;
        const fact = facts.cards[event.ticket.id];
        const owner = fact?.slug ?? slug;
        if (fact) {
          delete facts.cards[event.ticket.id];
          this.recount(fact.slug);
        }
        if (owner) facts.archivedTickets[owner] = (facts.archivedTickets[owner] ?? 0) + 1;
        pushCapped(facts.archives, { seq: event.seq, ts, slug: owner, ticketId: event.ticket.id, ticketKey: event.ticket.key, card: fact?.card ?? null });
        return;
      }
      case "ticket.progress": {
        pushCapped(facts.progress, {
          seq: event.seq,
          ts,
          slug,
          ticketKey: event.payload.ticket,
          agent: event.payload.agent,
          kind: event.payload.kind,
          text: event.payload.text.slice(0, 200),
        });
        return;
      }
      case "ticket.stalled": {
        const { reason } = event.payload;
        if (reason !== "stalled" && reason !== "attention") return; // a new reason: tolerated, not drawn
        const blocked = event.payload.members.find((member) => member.status === "blocked");
        const previous = facts.stalls[event.payload.ticket];
        facts.stalls[event.payload.ticket] = {
          ticketKey: event.payload.ticket,
          state: reason,
          quietSince: event.payload.quietSince,
          quietMinutes: event.payload.quietMinutes,
          agent: event.payload.agent,
          blockedMember: blocked?.name ?? null,
          nudges: previous ? previous.nudges + (event.payload.nudge ? 1 : 0) : event.payload.nudge ? 1 : 0,
        };
        this.patchCardByKey(event.payload.ticket, (card) => ({
          ...card,
          stall: { state: reason, quietSince: event.payload.quietSince },
        }));
        return;
      }
      case "ticket.resumed": {
        delete facts.stalls[event.payload.ticket];
        this.patchCardByKey(event.payload.ticket, (card) => ({ ...card, stall: null }));
        return;
      }
      case "delivery.created": {
        facts.deliveries[event.payload.deliveryId] = {
          deliveryId: event.payload.deliveryId,
          recipientId: event.payload.recipientId,
          reason: event.payload.reason,
          state: facts.deliveries[event.payload.deliveryId]?.state ?? "pending",
          slug,
          ticketKey: event.ticket?.key ?? null,
          createdAt: ts,
          updatedAt: ts,
        };
        capDeliveries(facts);
        return;
      }
      case "delivery.updated": {
        const previous = facts.deliveries[event.payload.deliveryId];
        facts.deliveries[event.payload.deliveryId] = previous
          ? { ...previous, state: event.payload.state, updatedAt: ts }
          : {
              deliveryId: event.payload.deliveryId,
              recipientId: null,
              reason: null,
              state: event.payload.state,
              slug,
              ticketKey: event.ticket?.key ?? null,
              createdAt: ts,
              updatedAt: ts,
            };
        capDeliveries(facts);
        return;
      }
      case "dm.created":
      case "dm.answered":
      case "team.updated":
        // Chat is mirrored by the bubbles dock; `team.updated` is a signal the source answers with a team message.
        return;
      case "project.created":
        this.refetch(`project:${event.payload.slug}`, () => this.refetchProject(event.payload.slug, true));
        return;
      case "project.updated":
        if (slug) this.refetch(`project:${slug}`, () => this.refetchProject(slug, false));
        return;
      case "project.archived": {
        if (!slug) return;
        const project = facts.projects[slug];
        if (project) {
          const archivedAt = readString(event.payload.new, "archivedAt") ?? event.ts;
          facts.projects[slug] = { ...project, archivedAt };
        }
        facts.order = facts.order.filter((s) => s !== slug);
        if (!facts.archivedOrder.includes(slug)) facts.archivedOrder.push(slug);
        for (const [id, fact] of Object.entries(facts.cards)) if (fact.slug === slug) delete facts.cards[id];
        return;
      }
      case "project.restored": {
        if (!slug) return;
        const project = facts.projects[slug];
        if (project) facts.projects[slug] = { ...project, archivedAt: null };
        facts.archivedOrder = facts.archivedOrder.filter((s) => s !== slug);
        if (!facts.order.includes(slug)) facts.order.push(slug);
        this.refetch(`board:${slug}`, () => this.refetchBoard(slug));
        return;
      }
      case "project.reordered": {
        const known = event.payload.slugs.filter((s) => facts.order.includes(s));
        facts.order = [...known, ...facts.order.filter((s) => !known.includes(s))];
        return;
      }
      case "milestone.created":
      case "milestone.updated":
      case "milestone.completed":
      case "milestone.cancelled":
      case "milestone.archived":
      case "milestone.restored": {
        if (!slug) return;
        const list = facts.milestones[slug] ?? [];
        const index = list.findIndex((m) => m.id === event.payload.milestoneId);
        const current = index >= 0 ? list[index] : undefined;
        if (!current) {
          this.refetch(`milestones:${slug}`, () => this.refetchMilestones(slug));
          return;
        }
        let next = { ...current, title: event.payload.title, key: event.payload.key };
        if (event.type === "milestone.completed") next = { ...next, state: "done" };
        if (event.type === "milestone.cancelled") next = { ...next, state: "cancelled" };
        if (event.type === "milestone.archived") next = { ...next, archivedAt: event.ts };
        if (event.type === "milestone.restored") next = { ...next, archivedAt: null };
        if (event.type === "milestone.updated") {
          const state = readString(event.payload.new, "state");
          if (state === "planned" || state === "active" || state === "done" || state === "cancelled") {
            next = { ...next, state };
          }
          const target = readNullableString(event.payload.new, "targetDate");
          if (target !== undefined) next = { ...next, targetDate: target };
        }
        facts.milestones[slug] = list.map((m, i) => (i === index ? next : m));
        return;
      }
      case "milestone.tickets_attached":
      case "milestone.tickets_detached": {
        if (slug) this.refetch(`milestones:${slug}`, () => this.refetchMilestones(slug));
        for (const id of event.payload.ticketIds) this.refetchTicket(id);
        return;
      }
      case "milestone.handoff":
        facts.handoffs[event.payload.milestoneId] = event.payload.recipientId;
        return;
      case "milestone.handoff_withdrawn":
        delete facts.handoffs[event.payload.milestoneId];
        return;
      case "release.created":
      case "release.updated":
        if (slug) this.refetch(`releases:${slug}`, () => this.refetchReleases(slug));
        return;
      case "release.published": {
        if (!slug) return;
        const list = facts.releases[slug] ?? [];
        if (!list.some((r) => r.id === event.payload.releaseId)) {
          this.refetch(`releases:${slug}`, () => this.refetchReleases(slug));
          return;
        }
        facts.releases[slug] = list.map((r) =>
          r.id === event.payload.releaseId
            ? { ...r, state: "published", publishedAt: event.ts, version: event.payload.version ?? r.version ?? null }
            : r,
        );
        return;
      }
      case "release.deleted": {
        if (!slug) return;
        facts.releases[slug] = (facts.releases[slug] ?? []).filter((r) => r.id !== event.payload.releaseId);
        return;
      }
    }
  }

  // Cards

  private nextPosition(slug: string, status: TicketCard["status"]): number {
    let max = 0;
    for (const fact of Object.values(this.state.cards)) {
      if (fact.slug === slug && fact.card.status === status) max = Math.max(max, fact.card.position);
    }
    return max + 1;
  }

  private patchCardByKey(key: string, patch: (card: TicketCard) => TicketCard): void {
    for (const [id, fact] of Object.entries(this.state.cards)) {
      if (fact.card.key === key) this.state.cards[id] = { slug: fact.slug, card: patch(fact.card) };
    }
  }

  /** Counts follow the cards on every change; a refetched `ProjectOut.counts` wins when it arrives. */
  private recount(slug: string): void {
    const project = this.state.projects[slug];
    if (!project) return;
    const counts = Object.fromEntries(TICKET_STATUSES.map((s) => [s, 0])) as ProjectOut["counts"];
    for (const fact of Object.values(this.state.cards)) if (fact.slug === slug) counts[fact.card.status] += 1;
    this.state.projects[slug] = { ...project, counts };
  }

  // Refetches

  private refetch(key: string, read: () => Promise<void>): void {
    if (this.pending.has(key)) return;
    const epoch = this.epoch;
    const handle = this.scheduler.setTimeout(() => {
      this.pending.delete(key);
      if (epoch !== this.epoch) return;
      read().catch(() => {
        // A failed read leaves the last known facts; the next event on the object asks again.
      });
    }, this.coalesceMs);
    this.pending.set(key, handle);
  }

  private refetchTicket(id: string): void {
    this.refetch(`ticket:${id}`, async () => {
      const epoch = this.epoch;
      const ticket = await this.source.getTicket(id);
      if (epoch !== this.epoch) return;
      this.applyTicket(id, ticket);
      this.changed();
    });
  }

  private applyTicket(id: string, ticket: Ticket | null): void {
    const previous = this.state.cards[id];
    if (!ticket || ticket.archivedAt) {
      if (previous) {
        delete this.state.cards[id];
        this.recount(previous.slug);
      }
      return;
    }
    const slug = ticket.project.slug;
    this.state.cards[id] = { slug, card: toCard(ticket, previous) };
    this.recount(slug);
    if (previous && previous.slug !== slug) this.recount(previous.slug);
  }

  private async refetchProject(slug: string, withBoard: boolean): Promise<void> {
    const epoch = this.epoch;
    const project = await this.source.getProject(slug);
    if (epoch !== this.epoch || !project) return;
    const facts = this.state;
    facts.projects[slug] = project;
    const archived = Boolean(project.archivedAt);
    if (archived) {
      facts.order = facts.order.filter((s) => s !== slug);
      if (!facts.archivedOrder.includes(slug)) facts.archivedOrder.push(slug);
    } else if (!facts.order.includes(slug)) {
      facts.order.push(slug);
    }
    this.changed();
    if (withBoard && !archived) this.refetch(`board:${slug}`, () => this.refetchBoard(slug));
  }

  private async refetchBoard(slug: string): Promise<void> {
    const epoch = this.epoch;
    const board = await this.source.getBoard(slug);
    if (epoch !== this.epoch || !board) return;
    for (const [id, fact] of Object.entries(this.state.cards)) if (fact.slug === slug) delete this.state.cards[id];
    for (const column of board.columns) {
      for (const card of column.tickets) this.state.cards[card.id] = { slug, card };
    }
    this.recount(slug);
    this.changed();
  }

  private async refetchMilestones(slug: string): Promise<void> {
    const epoch = this.epoch;
    const milestones = await this.source.getMilestones(slug);
    if (epoch !== this.epoch) return;
    this.state.milestones[slug] = milestones;
    this.changed();
  }

  private async refetchReleases(slug: string): Promise<void> {
    const epoch = this.epoch;
    const releases = await this.source.getReleases(slug);
    if (epoch !== this.epoch) return;
    this.state.releases[slug] = releases;
    this.changed();
  }
}

/** A full ticket as a board card; link chips are kept from the previous card (the ticket has `LinkOut`s). */
function toCard(ticket: Ticket, previous: CardFact | undefined): TicketCard {
  const card: TicketCard = {
    id: ticket.id,
    key: ticket.key,
    title: ticket.title,
    kind: ticket.kind,
    status: ticket.status,
    priority: ticket.priority,
    position: ticket.position,
    version: ticket.version,
    updatedAt: ticket.updatedAt,
    statusChangedAt: ticket.statusChangedAt,
  };
  if (ticket.assignee !== undefined) card.assignee = ticket.assignee;
  if (ticket.waitingOn !== undefined) card.waitingOn = ticket.waitingOn;
  if (ticket.labels !== undefined) card.labels = ticket.labels;
  if (ticket.commentCount !== undefined) card.commentCount = ticket.commentCount;
  if (ticket.attachmentCount !== undefined) card.attachmentCount = ticket.attachmentCount;
  if (ticket.agentWorking !== undefined) card.agentWorking = ticket.agentWorking;
  if (ticket.stall !== undefined) card.stall = ticket.stall;
  if (ticket.waitingOnHuman !== undefined) card.waitingOnHuman = ticket.waitingOnHuman;
  if (ticket.milestone !== undefined) card.milestone = ticket.milestone;
  if (ticket.held !== undefined) card.held = ticket.held;
  if (ticket.blocked !== undefined) card.blocked = ticket.blocked;
  if (previous?.card.links !== undefined) card.links = previous.card.links;
  return card;
}

function pushCapped<T>(list: T[], item: T): void {
  list.push(item);
  if (list.length > HISTORY_CAP) list.splice(0, list.length - HISTORY_CAP);
}

function capDeliveries(facts: Facts): void {
  const ids = Object.keys(facts.deliveries);
  if (ids.length <= DELIVERY_CAP) return;
  const oldest = ids
    .map((id) => facts.deliveries[id]!)
    .sort((a, b) => a.updatedAt - b.updatedAt)
    .slice(0, ids.length - DELIVERY_CAP);
  for (const delivery of oldest) delete facts.deliveries[delivery.deliveryId];
}

function readString(value: unknown, key: string): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : undefined;
}

function readNullableString(value: unknown, key: string): string | null | undefined {
  if (typeof value !== "object" || value === null || !(key in value)) return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" || field === null ? field : undefined;
}

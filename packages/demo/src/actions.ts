/**
 * Script actions: loops-level changes. Applying one mutates the DemoState and appends the
 * envelopes crewhub-loops would write for it, in its order and with the payloads of events.md.
 * The loops rules are enforced here (agents never move to Done, and so on): a script that breaks
 * one throws, so the demo cannot show something loops would refuse.
 */
import type {
  DeliveryOut,
  DeliveryReason,
  DeliveryState,
  Envelope,
  MilestoneState,
  ProgressKind,
  TeamSnapshot,
  TicketKind,
  TicketPriority,
  TicketStatus,
} from "@crewhub/loops-client";
import { DEMO_SESSION } from "./content.ts";
import {
  type DemoState,
  type StoredTicket,
  actorRef,
  dmMessage,
  dmThread,
  isAgent,
  isLeadAgent,
  labelByName,
  milestoneByKey,
  milestoneKey,
  nextId,
  nextNumber,
  normalComment,
  principalRef,
  requireProject,
  requireTicket,
  ticketId,
  uploadSnapshot,
} from "./store.ts";
import { MINUTE, iso } from "./time.ts";

export type Action =
  | {
      type: "createTicket";
      by: string;
      project: string;
      title: string;
      kind: TicketKind;
      priority: TicketPriority;
      status?: TicketStatus;
      assignee?: string | null;
      labels?: string[];
      body: string;
    }
  | { type: "move"; by: string; ticket: string; to: TicketStatus }
  | { type: "assign"; by: string; ticket: string; assignee: string | null }
  | { type: "labels"; by: string; ticket: string; labels: string[] }
  | { type: "waitOn"; by: string; ticket: string; on: string | null }
  | { type: "block"; by: string; ticket: string; blocker: string }
  | { type: "comment"; by: string; ticket: string; text: string; replyToLast?: boolean }
  | { type: "progress"; ticket: string; agent: string; kind: ProgressKind; text: string; worker?: string }
  | { type: "archiveDone"; by: string; project: string; tickets: string[] }
  | { type: "unarchive"; by: string; ticket: string }
  | { type: "stall"; ticket: string; reason: "stalled" | "attention"; quietMinutes: number; nudge: boolean }
  | { type: "resume"; ticket: string; resolution: "activity" | "attending" | "excluded" | "reassigned" }
  | { type: "lane"; name: string; status?: string; contextLine?: string | null }
  | { type: "laneJoin"; name: string; status: string; contextLine: string | null }
  | { type: "laneLeave"; name: string }
  | { type: "probe" }
  | { type: "poll" }
  | { type: "postman"; source: number; state: DeliveryState; detail?: string }
  | { type: "dm"; from: string; agent: string; text: string }
  | { type: "dmReply"; agent: string; text: string }
  | { type: "milestoneCreate"; by: string; project: string; title: string; targetDate: string | null }
  | { type: "milestoneAttach"; by: string; milestone: string; tickets: string[] }
  | { type: "milestoneState"; by: string; milestone: string; state: MilestoneState }
  | { type: "handoff"; by: string; milestone: string; recipient: string }
  | { type: "releaseCreate"; by: string; project: string; title: string; version: string | null; tickets: string[] }
  | { type: "releaseRequestPublish"; by: string; project: string }
  | { type: "releasePublish"; by: string; project: string }
  | { type: "projectRestore"; by: string; project: string }
  | { type: "projectArchive"; by: string; project: string }
  | { type: "projectUpdate"; by: string; project: string; description: string }
  | { type: "projectReorder"; by: string; slugs: string[] };

/** What one action produces for the stream, in order. */
export type Output = { type: "event"; envelope: Envelope } | { type: "team"; team: TeamSnapshot };

interface Context {
  state: DemoState;
  actionId: number;
  out: Output[];
}

export function applyAction(state: DemoState, action: Action, actionId: number): Output[] {
  const ctx: Context = { state, actionId, out: [] };
  HANDLERS[action.type](ctx, action as never);
  return ctx.out;
}

// Envelope helpers

function emit(
  ctx: Context,
  type: string,
  actorId: string,
  target: { ticket?: StoredTicket | null; project?: string | null },
  payload: Record<string, unknown>,
): Envelope {
  const { state } = ctx;
  state.seq += 1;
  const ticket = target.ticket ?? null;
  const projectSlug = target.project !== undefined ? target.project : (ticket?.project ?? null);
  const project = projectSlug === null ? null : requireProject(state, projectSlug);
  const envelope: Envelope = {
    v: 1,
    seq: state.seq,
    ts: iso(state.now),
    type,
    project: project === null ? null : { slug: project.slug, key: project.key },
    ticket: ticket === null ? null : { id: ticket.id, key: ticket.key, title: ticket.title },
    actor: actorRef(actorId),
    recipientIds: [],
    payload,
  };
  state.events.push(envelope);
  ctx.out.push({ type: "event", envelope });
  return envelope;
}

/** A delivery hangs on its parent event: `recipientIds` of both name the recipient. */
function deliver(
  ctx: Context,
  parent: Envelope,
  recipientId: string,
  reason: DeliveryReason,
  ticket: StoredTicket | null,
  extra: { dmMessageId?: string; commentId?: string; dmThreadId?: string } = {},
): DeliveryOut {
  const { state } = ctx;
  const delivery: DeliveryOut = {
    id: nextId(state, "dl"),
    eventSeq: parent.seq,
    recipientId,
    ticketId: ticket?.id ?? null,
    dmMessageId: extra.dmMessageId ?? null,
    commentId: extra.commentId ?? null,
    reason,
    state: "pending",
    attempts: 0,
    attemptId: null,
    attemptedSession: null,
    leaseUntil: null,
    nextAttemptAt: null,
    lastError: null,
    seenAt: null,
    createdAt: iso(state.now),
    updatedAt: iso(state.now),
  };
  state.deliveries.push(delivery);
  state.deliveryAction[delivery.id] = ctx.actionId;
  if (!parent.recipientIds.includes(recipientId)) parent.recipientIds.push(recipientId);
  const payload: Record<string, unknown> = { deliveryId: delivery.id, recipientId, reason };
  if (extra.dmThreadId !== undefined) payload["dmThreadId"] = extra.dmThreadId;
  const created = emit(
    ctx,
    "delivery.created",
    parent.actor.id,
    { ticket, project: parent.project?.slug ?? null },
    payload,
  );
  created.recipientIds.push(recipientId);
  return delivery;
}

/** Who a ticket's delivery goes to: its lead assignee, else the project lead (routing.py). */
function routeFor(ctx: Context, t: StoredTicket): string {
  if (t.assigneeId !== null && isLeadAgent(t.assigneeId)) return t.assigneeId;
  return requireProject(ctx.state, t.project).leadId;
}

/** A ticket key or id, or `@<actionId>` for the ticket a script action created. */
function ticketOf(ctx: Context, ref: string): StoredTicket {
  if (!ref.startsWith("@")) return requireTicket(ctx.state, ref);
  const id = ctx.state.actionTickets[Number(ref.slice(1))];
  if (id === undefined) throw new Error(`Action ${ref.slice(1)} created no ticket`);
  return requireTicket(ctx.state, id);
}

function touch(ctx: Context, t: StoredTicket): void {
  t.version += 1;
  t.updatedAt = ctx.state.now;
}

function columnPositions(ctx: Context, t: StoredTicket, status: TicketStatus): number[] {
  return ctx.state.tickets
    .filter((o) => o !== t && o.project === t.project && o.status === status && o.archivedAt === null)
    .map((o) => o.position);
}

function bottom(ctx: Context, t: StoredTicket, status: TicketStatus): number {
  return Math.max(0, ...columnPositions(ctx, t, status)) + 1;
}

function top(ctx: Context, t: StoredTicket, status: TicketStatus): number {
  const positions = columnPositions(ctx, t, status);
  return positions.length === 0 ? 1 : Math.min(...positions) - 1;
}

function setStatus(ctx: Context, t: StoredTicket, to: TicketStatus, position: number): TicketStatus {
  const from = t.status;
  t.status = to;
  t.position = position;
  t.statusChangedAt = ctx.state.now;
  t.closedAt = to === "done" ? ctx.state.now : null;
  touch(ctx, t);
  return from;
}

/** A blocker reaching Review releases the tickets it blocks (relations.py). */
function releaseBlocked(ctx: Context, blocker: StoredTicket, actorId: string): void {
  if (blocker.status !== "review" && blocker.status !== "done") return;
  for (const blocked of ctx.state.tickets) {
    if (!blocked.blockedBy.includes(blocker.id) || blocked.archivedAt !== null) continue;
    const stillBlocked = blocked.blockedBy.some((id) => {
      const other = requireTicket(ctx.state, id);
      return other.status !== "review" && other.status !== "done" && other.archivedAt === null;
    });
    if (stillBlocked) continue;
    touch(ctx, blocked);
    const event = emit(ctx, "ticket.updated", actorId, { ticket: blocked }, {
      changed: ["blocked"],
      unblockedBy: blocker.key,
      how: "review",
    });
    if (blocked.assigneeId !== null && isLeadAgent(blocked.assigneeId)) {
      deliver(ctx, event, blocked.assigneeId, "unblocked", blocked);
    }
  }
}

function assertActiveProject(ctx: Context, t: StoredTicket): void {
  if (requireProject(ctx.state, t.project).archivedAt !== null) {
    throw new Error(`${t.key}: its project is archived`);
  }
}

// Handlers

type Handlers = { [K in Action["type"]]: (ctx: Context, action: Extract<Action, { type: K }>) => void };

const HANDLERS: Handlers = {
  createTicket(ctx, a) {
    const { state } = ctx;
    const project = requireProject(state, a.project);
    const number = project.nextTicketNumber++;
    const key = `${project.key}-${number}`;
    const status = a.status ?? "backlog";
    const t: StoredTicket = {
      id: ticketId(key),
      key,
      project: project.slug,
      title: a.title,
      kind: a.kind,
      status,
      priority: a.priority,
      position: 0,
      version: 1,
      assigneeId: a.assignee ?? null,
      waitingOnId: null,
      labelIds: (a.labels ?? []).map((name) => labelByName(state, name).id),
      held: false,
      milestoneId: null,
      blockedBy: [],
      createdAt: state.now,
      updatedAt: state.now,
      statusChangedAt: state.now,
      closedAt: null,
      archivedAt: null,
      releaseId: null,
      createdById: a.by,
      bodyMarkdown: a.body,
      stall: null,
      episodes: 0,
    };
    t.position = bottom(ctx, t, status);
    state.tickets.push(t);
    state.actionTickets[ctx.actionId] = t.id;
    const event = emit(ctx, "ticket.created", a.by, { ticket: t }, {
      kind: t.kind,
      status: t.status,
      assigneeId: t.assigneeId,
    });
    const recipient = routeFor(ctx, t);
    if (recipient !== a.by) deliver(ctx, event, recipient, "new_ticket", t);
  },

  move(ctx, a) {
    const t = ticketOf(ctx, a.ticket);
    assertActiveProject(ctx, t);
    if (a.to === "done" && isAgent(a.by)) throw new Error(`${a.by} is an agent: agents never move ${t.key} to done`);
    if (a.to === t.status) throw new Error(`${t.key} is already ${a.to}`);
    const payload: Record<string, unknown> = {};
    const from = setStatus(ctx, t, a.to, bottom(ctx, t, a.to));
    Object.assign(payload, { from, to: a.to, position: t.position });
    if (a.to === "done" && t.waitingOnId !== null) {
      t.waitingOnId = null;
      payload["waitingOnCleared"] = true;
    }
    if (a.to !== "in_progress") t.stall = null;
    const event = emit(ctx, "ticket.moved", a.by, { ticket: t }, payload);
    if (a.to === "planned" && !isAgent(a.by)) deliver(ctx, event, routeFor(ctx, t), "planned", t);
    releaseBlocked(ctx, t, a.by);
  },

  assign(ctx, a) {
    const t = ticketOf(ctx, a.ticket);
    t.assigneeId = a.assignee;
    touch(ctx, t);
    const event = emit(ctx, "ticket.updated", a.by, { ticket: t }, { changed: ["assignee"] });
    if (a.assignee !== null && a.assignee !== a.by && isLeadAgent(a.assignee)) {
      deliver(ctx, event, a.assignee, "assigned", t);
    }
  },

  labels(ctx, a) {
    const t = ticketOf(ctx, a.ticket);
    t.labelIds = a.labels.map((name) => labelByName(ctx.state, name).id);
    touch(ctx, t);
    emit(ctx, "ticket.updated", a.by, { ticket: t }, { changed: ["labels"] });
  },

  waitOn(ctx, a) {
    const t = ticketOf(ctx, a.ticket);
    t.waitingOnId = a.on;
    touch(ctx, t);
    emit(ctx, "ticket.updated", a.by, { ticket: t }, { changed: ["waiting_on"] });
  },

  block(ctx, a) {
    const blocked = ticketOf(ctx, a.ticket);
    const blocker = ticketOf(ctx, a.blocker);
    blocked.blockedBy.push(blocker.id);
    for (const [row, value] of [
      [blocked, { blockedBy: blocker.key, until: "review" }],
      [blocker, { blocking: blocked.key, until: "review" }],
    ] as const) {
      touch(ctx, row);
      emit(ctx, "ticket.updated", a.by, { ticket: row }, { changed: ["relation"], relation: { ...value, op: "added" } });
    }
  },

  comment(ctx, a) {
    const { state } = ctx;
    const t = ticketOf(ctx, a.ticket);
    assertActiveProject(ctx, t);
    const id = nextId(state, "cm");
    const parent = a.replyToLast === true ? state.comments.filter((c) => c.ticketId === t.id).at(-1) : undefined;
    const comment = normalComment(state, id, t.id, principalRef(a.by), a.text, state.now, parent?.id ?? null);
    state.comments.push(comment);
    t.updatedAt = state.now;
    const event = emit(ctx, "comment.created", a.by, { ticket: t }, { commentId: id, parentId: comment.parentId });
    if (isAgent(a.by)) {
      // An agent's comment: loops auto-assigns an unassigned ticket to the commenting lead.
      if (t.assigneeId === null && isLeadAgent(a.by)) {
        t.assigneeId = a.by;
        touch(ctx, t);
        emit(ctx, "ticket.updated", a.by, { ticket: t }, { changed: ["assignee"] });
      }
      return;
    }
    if (t.status === "review" && t.waitingOnId === a.by) {
      t.waitingOnId = null;
      setStatus(ctx, t, "in_progress", top(ctx, t, "in_progress"));
      emit(ctx, "ticket.moved", a.by, { ticket: t }, {
        from: "review",
        to: "in_progress",
        position: t.position,
        reason: "review_reply",
      });
    } else if (t.status === "in_progress" && t.waitingOnId === a.by) {
      t.waitingOnId = null;
      touch(ctx, t);
      emit(ctx, "ticket.updated", a.by, { ticket: t }, { changed: ["waiting_on"], reason: "wait_reply" });
    }
    if (!t.held) deliver(ctx, event, routeFor(ctx, t), "comment", t, { commentId: id });
  },

  progress(ctx, a) {
    const { state } = ctx;
    const t = ticketOf(ctx, a.ticket);
    if (t.assigneeId !== a.agent || !isLeadAgent(a.agent)) {
      throw new Error(`${a.agent} is not the lead lane of ${t.key}: only it writes progress`);
    }
    if (a.text.length > 200) throw new Error(`Progress line on ${t.key} is longer than 200 characters`);
    state.progress.push({
      ticketId: t.id,
      id: nextNumber(state, "progress"),
      agent: principalRef(a.agent),
      kind: a.kind,
      text: a.text,
      worker: a.worker ?? null,
      source: a.worker === undefined ? "cli" : "herdr",
      createdAt: iso(state.now),
    });
    emit(ctx, "ticket.progress", a.agent, { ticket: t }, {
      ticket: t.key,
      agent: a.agent,
      kind: a.kind,
      text: a.worker === undefined ? a.text : `${a.worker}: ${a.text}`,
    });
  },

  archiveDone(ctx, a) {
    const { state } = ctx;
    const tickets = a.tickets.map((ref) => ticketOf(ctx, ref));
    const batchId = nextId(state, "ab");
    for (const t of tickets) {
      if (t.status !== "done" || t.archivedAt !== null) throw new Error(`${t.key} is not an open Done ticket`);
      t.archivedAt = state.now;
      touch(ctx, t);
      emit(ctx, "ticket.archived", a.by, { ticket: t }, {
        batchId,
        batchSize: tickets.length,
        releaseId: null,
        reason: "archive_all",
      });
    }
  },

  unarchive(ctx, a) {
    const t = ticketOf(ctx, a.ticket);
    if (t.archivedAt === null) throw new Error(`${t.key} is not archived`);
    t.archivedAt = null;
    t.position = bottom(ctx, t, t.status);
    touch(ctx, t);
    emit(ctx, "ticket.unarchived", a.by, { ticket: t }, { batchId: null, releaseId: null });
  },

  stall(ctx, a) {
    const { state } = ctx;
    const t = ticketOf(ctx, a.ticket);
    if (t.status !== "in_progress" || t.assigneeId === null) throw new Error(`${t.key} cannot stall`);
    t.episodes += 1;
    const quietSince = state.now - a.quietMinutes * MINUTE;
    const members = state.team.sessions
      .flatMap((s) => s.agents)
      .filter((m) => m.name === t.assigneeId || m.lead === t.assigneeId)
      .map((m) => ({ name: m.name, status: m.status }));
    t.stall = {
      state: a.reason,
      episode: t.episodes,
      quietSince,
      detectedAt: state.now,
      nudges: a.nudge ? 1 : 0,
      lastNudgeAt: a.nudge ? state.now : null,
      deliveryRecipientId: a.nudge ? t.assigneeId : null,
      deliveryId: null,
    };
    const event = emit(ctx, "ticket.stalled", "system", { ticket: t }, {
      ticket: t.key,
      agent: t.assigneeId,
      episode: t.episodes,
      reason: a.reason,
      quietSince: iso(quietSince),
      quietMinutes: a.quietMinutes,
      members,
      nudge: a.nudge ? 1 : 0,
    });
    if (a.nudge && a.reason === "stalled") t.stall.deliveryId = deliver(ctx, event, t.assigneeId, "stalled", t).id;
  },

  resume(ctx, a) {
    const { state } = ctx;
    const t = ticketOf(ctx, a.ticket);
    const stall = t.stall;
    if (stall === null) throw new Error(`${t.key} has no open episode`);
    t.stall = null;
    const payload: Record<string, unknown> = {
      ticket: t.key,
      agent: t.assigneeId ?? "",
      episode: stall.episode,
      resolution: a.resolution,
      minutes: Math.max(0, Math.floor((state.now - stall.detectedAt) / MINUTE)),
    };
    if (stall.deliveryId !== null) payload["deliveryId"] = stall.deliveryId;
    emit(ctx, "ticket.resumed", "system", { ticket: t }, payload);
  },

  lane(ctx, a) {
    const lane = ctx.state.lanes.find((l) => l.name === a.name);
    if (lane === undefined) throw new Error(`No lane ${a.name}`);
    if (a.status !== undefined) lane.status = a.status;
    if (a.contextLine !== undefined) lane.contextLine = a.contextLine;
  },

  laneJoin(ctx, a) {
    const { lanes } = ctx.state;
    if (lanes.some((l) => l.name === a.name)) throw new Error(`Lane ${a.name} already exists`);
    lanes.push({
      name: a.name,
      status: a.status,
      contextLine: a.contextLine,
      paneId: `p${nextNumber(ctx.state, "pane") + 40}`,
      workspaceId: a.name.startsWith("cl-") ? "w2" : "w1",
    });
  },

  laneLeave(ctx, a) {
    ctx.state.lanes = ctx.state.lanes.filter((l) => l.name !== a.name);
  },

  probe(ctx) {
    const { state } = ctx;
    const next = uploadSnapshot(state, state.now);
    const changed = JSON.stringify(next.sessions) !== JSON.stringify(state.team.sessions);
    state.team = next;
    if (changed) {
      emit(ctx, "team.updated", "team-probe", { project: null }, {});
      ctx.out.push({ type: "team", team: structuredClone(next) });
    }
  },

  poll(ctx) {
    ctx.out.push({ type: "team", team: structuredClone(ctx.state.team) });
  },

  postman(ctx, a) {
    const { state } = ctx;
    const deliveries = state.deliveries.filter((d) => state.deliveryAction[d.id] === a.source);
    if (deliveries.length === 0) throw new Error(`Action ${a.source} created no delivery for the postman`);
    for (const d of deliveries) {
      d.state = a.state;
      d.updatedAt = iso(state.now);
      if (a.state === "claimed") {
        d.attempts += 1;
        d.attemptId = `at_demo_${d.id}_${d.attempts}`;
        d.attemptedSession = DEMO_SESSION;
        d.leaseUntil = iso(state.now + 2 * MINUTE);
      } else {
        d.leaseUntil = null;
      }
      if (a.state === "uncertain" || a.state === "unroutable") d.lastError = a.detail ?? a.state;
      const message = state.dmMessages.find((m) => m.deliveryId === d.id);
      if (message !== undefined) {
        message.deliveryState = a.state;
        if (a.state === "forwarded" && message.state === "queued") message.state = "delivered";
      }
      const ticket = d.ticketId === null ? null : requireTicket(state, d.ticketId);
      const payload: Record<string, unknown> = { deliveryId: d.id, state: a.state };
      if (message !== undefined) payload["dmThreadId"] = message.threadId;
      emit(ctx, "delivery.updated", "postman", { ticket, project: ticket?.project ?? null }, payload);
      if (ticket !== null && (a.state === "uncertain" || a.state === "unroutable")) {
        const id = nextId(state, "cm");
        state.comments.push({
          id,
          ticketId: ticket.id,
          parentId: null,
          rootId: id,
          author: principalRef("system"),
          kind: "system",
          systemCode: a.state,
          deliveryId: d.id,
          body: { v: "1", system: { code: a.state, lead: d.recipientId, detail: a.detail ?? null } },
          bodyMarkdown: null,
          attachments: [],
          createdAt: iso(state.now),
          editedAt: null,
          deletedAt: null,
        });
        emit(ctx, "comment.created", "system", { ticket }, { commentId: id, parentId: null });
      }
    }
  },

  dm(ctx, a) {
    const { state } = ctx;
    const thread = dmThread(state, a.agent, state.now);
    const message = dmMessage(state, thread, a.from, a.text, state.now, null);
    thread.lastMessageAt = message.createdAt;
    const payload = { threadId: thread.id, messageId: message.id, agentId: a.agent };
    const event = emit(ctx, "dm.created", a.from, { project: null }, payload);
    const delivery = deliver(ctx, event, a.agent, "dm", null, { dmMessageId: message.id, dmThreadId: thread.id });
    message.deliveryId = delivery.id;
    message.deliveryState = "pending";
  },

  dmReply(ctx, a) {
    const { state } = ctx;
    const thread = dmThread(state, a.agent, state.now);
    const parent = state.dmMessages.filter((m) => m.threadId === thread.id && m.author.kind === "user").at(-1);
    if (parent === undefined) throw new Error(`Nothing to answer in ${thread.id}`);
    const reply = dmMessage(state, thread, a.agent, a.text, state.now, parent.id);
    reply.state = "delivered";
    parent.state = "answered";
    parent.answeredAt = iso(state.now);
    thread.lastMessageAt = reply.createdAt;
    thread.unreadCount += 1;
    emit(ctx, "dm.created", a.agent, { project: null }, { threadId: thread.id, messageId: reply.id, agentId: a.agent });
    emit(ctx, "dm.answered", a.agent, { project: null }, { threadId: thread.id, messageId: parent.id, agentId: a.agent });
  },

  milestoneCreate(ctx, a) {
    const { state } = ctx;
    const project = requireProject(state, a.project);
    if (!project.features.milestones) throw new Error(`${a.project} has milestones off`);
    const number = project.nextMilestoneNumber++;
    const m = {
      id: `ms_demo_${project.key.toLowerCase()}_${number}`,
      project: project.slug,
      number,
      title: a.title,
      state: "planned" as const,
      targetDate: a.targetDate,
      position: 1 + state.milestones.filter((x) => x.project === project.slug).length,
      ownerId: a.by,
      createdAt: state.now,
      updatedAt: state.now,
      startedAt: null,
      completedAt: null,
      revision: 1,
    };
    state.milestones.push(m);
    emit(ctx, "milestone.created", a.by, { project: project.slug }, milestonePayload(ctx, m.id));
  },

  milestoneAttach(ctx, a) {
    const { state } = ctx;
    const m = milestoneByKey(state, a.milestone);
    const tickets = a.tickets.map((ref) => ticketOf(ctx, ref));
    for (const t of tickets) {
      const old = t.milestoneId;
      t.milestoneId = m.id;
      touch(ctx, t);
      emit(ctx, "ticket.updated", a.by, { ticket: t }, { changed: ["milestone"], milestone: { old, new: m.id } });
    }
    emit(ctx, "milestone.tickets_attached", a.by, { project: m.project }, {
      ...milestonePayload(ctx, m.id),
      ticketIds: tickets.map((t) => t.id),
    });
  },

  milestoneState(ctx, a) {
    const { state } = ctx;
    const m = milestoneByKey(state, a.milestone);
    const old = m.state;
    m.state = a.state;
    m.updatedAt = state.now;
    m.revision += 1;
    if (a.state === "active" && m.startedAt === null) m.startedAt = state.now;
    if (a.state === "done") {
      m.completedAt = state.now;
      emit(ctx, "milestone.completed", a.by, { project: m.project }, milestonePayload(ctx, m.id));
    } else if (a.state === "cancelled") {
      emit(ctx, "milestone.cancelled", a.by, { project: m.project }, milestonePayload(ctx, m.id));
    } else {
      emit(ctx, "milestone.updated", a.by, { project: m.project }, {
        ...milestonePayload(ctx, m.id),
        changed: ["state"],
        old: { state: old },
        new: { state: a.state },
      });
    }
  },

  handoff(ctx, a) {
    const { state } = ctx;
    if (isAgent(a.by)) throw new Error("A hand-off is a person's action");
    const m = milestoneByKey(state, a.milestone);
    const handoffId = nextId(state, "ho");
    const tickets = state.tickets.filter((t) => t.milestoneId === m.id && t.status === "backlog" && t.archivedAt === null);
    for (const t of tickets) {
      t.assigneeId = a.recipient;
      t.held = false;
      setStatus(ctx, t, "planned", bottom(ctx, t, "planned"));
      const event = emit(ctx, "ticket.moved", a.by, { ticket: t }, {
        from: "backlog",
        to: "planned",
        position: t.position,
        code: "milestone_handoff",
        milestoneId: m.id,
        handoffId,
      });
      deliver(ctx, event, a.recipient, "planned", t);
    }
    emit(ctx, "milestone.handoff", a.by, { project: m.project }, {
      ...milestonePayload(ctx, m.id),
      handoffId,
      count: tickets.length,
      recipientId: a.recipient,
    });
  },

  releaseCreate(ctx, a) {
    const { state } = ctx;
    const project = requireProject(state, a.project);
    if (!project.features.releases) throw new Error(`${a.project} has releases off`);
    if (state.releases.some((r) => r.project === project.slug && r.state === "draft")) {
      throw new Error(`${a.project} already has an open draft`);
    }
    const members = a.tickets.map((ref) => ticketOf(ctx, ref));
    const number = project.nextReleaseNumber++;
    const releaseId = `rl_demo_${project.key.toLowerCase()}_${number}`;
    const carrierKey = `${project.key}-${project.nextTicketNumber++}`;
    const carrier: StoredTicket = {
      id: ticketId(carrierKey),
      key: carrierKey,
      project: project.slug,
      title: `Release ${number}${a.version === null ? "" : ` (${a.version})`}: ${a.title}`,
      kind: "task",
      status: "in_progress",
      priority: "normal",
      position: 0,
      version: 1,
      assigneeId: project.leadId,
      waitingOnId: null,
      labelIds: [labelByName(state, "release").id],
      held: false,
      milestoneId: null,
      blockedBy: [],
      createdAt: state.now,
      updatedAt: state.now,
      statusChangedAt: state.now,
      closedAt: null,
      archivedAt: null,
      releaseId,
      createdById: a.by,
      bodyMarkdown: `Release carrier. Members: ${members.map((t) => t.key).join(", ")}.`,
      stall: null,
      episodes: 0,
    };
    carrier.position = bottom(ctx, carrier, "in_progress");
    state.tickets.push(carrier);
    state.actionTickets[ctx.actionId] = carrier.id;
    state.releases.push({
      id: releaseId,
      project: project.slug,
      number,
      version: a.version,
      title: a.title,
      state: "draft",
      carrierId: carrier.id,
      requestedLeadId: project.leadId,
      createdById: a.by,
      createdAt: state.now,
      publishedAt: null,
      publishRequestedBy: null,
      revision: 1,
      memberIds: members.map((t) => t.id),
    });
    emit(ctx, "ticket.created", a.by, { ticket: carrier }, {
      kind: carrier.kind,
      status: carrier.status,
      assigneeId: carrier.assigneeId,
    });
    const batchId = nextId(state, "ab");
    for (const t of members) {
      if (t.status !== "done" || t.archivedAt !== null) throw new Error(`${t.key} cannot join a release`);
      t.archivedAt = state.now;
      t.releaseId = releaseId;
      touch(ctx, t);
      emit(ctx, "ticket.archived", a.by, { ticket: t }, {
        batchId,
        batchSize: members.length,
        releaseId,
        reason: "release",
      });
    }
    const event = emit(ctx, "release.created", a.by, { ticket: carrier }, {
      releaseId,
      number,
      count: members.length,
    });
    deliver(ctx, event, project.leadId, "release", carrier);
  },

  releaseRequestPublish(ctx, a) {
    const { state } = ctx;
    const r = openDraft(ctx, a.project);
    r.publishRequestedBy = a.by;
    r.revision += 1;
    const carrier = requireTicket(state, r.carrierId);
    const event = emit(ctx, "release.updated", a.by, { ticket: carrier }, {
      releaseId: r.id,
      revision: r.revision,
      changed: ["publishRequest"],
      code: "publish_requested",
    });
    deliver(ctx, event, r.requestedLeadId, "release", carrier);
  },

  releasePublish(ctx, a) {
    const { state } = ctx;
    const r = openDraft(ctx, a.project);
    if (a.by !== r.requestedLeadId) throw new Error("Publishing is the requested lead's");
    if (r.publishRequestedBy === null) throw new Error("Nobody asked for the publish");
    const carrier = requireTicket(state, r.carrierId);
    const from = setStatus(ctx, carrier, "review", top(ctx, carrier, "review"));
    carrier.waitingOnId = r.publishRequestedBy;
    emit(ctx, "ticket.moved", a.by, { ticket: carrier }, { from, to: "review", position: carrier.position });
    r.state = "published";
    r.publishedAt = state.now;
    r.revision += 1;
    emit(ctx, "release.published", a.by, { ticket: carrier }, {
      releaseId: r.id,
      revision: r.revision,
      version: r.version,
    });
  },

  projectRestore(ctx, a) {
    const { state } = ctx;
    const p = requireProject(state, a.project);
    if (p.archivedAt === null) throw new Error(`${p.slug} is not archived`);
    const old = iso(p.archivedAt);
    p.archivedAt = null;
    p.archivedById = null;
    p.revision += 1;
    state.order.push(p.slug);
    emit(ctx, "project.restored", a.by, { project: p.slug }, {
      changed: ["archivedAt"],
      old: { archivedAt: old },
      new: { archivedAt: null },
    });
  },

  projectArchive(ctx, a) {
    const { state } = ctx;
    const p = requireProject(state, a.project);
    if (p.archivedAt !== null) throw new Error(`${p.slug} is already archived`);
    p.archivedAt = state.now;
    p.archivedById = a.by;
    p.revision += 1;
    state.order = state.order.filter((slug) => slug !== p.slug);
    emit(ctx, "project.archived", a.by, { project: p.slug }, {
      changed: ["archivedAt"],
      old: { archivedAt: null },
      new: { archivedAt: iso(state.now) },
    });
  },

  projectUpdate(ctx, a) {
    const p = requireProject(ctx.state, a.project);
    const old = p.description;
    p.description = a.description;
    p.revision += 1;
    emit(ctx, "project.updated", a.by, { project: p.slug }, {
      changed: ["description"],
      old: { description: old },
      new: { description: a.description },
    });
  },

  projectReorder(ctx, a) {
    const { state } = ctx;
    const active = [...state.order].sort().join();
    if ([...a.slugs].sort().join() !== active) throw new Error("A reorder names exactly the active projects");
    state.order = [...a.slugs];
    state.orderRevision += 1;
    emit(ctx, "project.reordered", a.by, { project: null }, { slugs: [...a.slugs] });
  },
};

function milestonePayload(ctx: Context, id: string): { milestoneId: string; key: string; title: string } {
  const m = milestoneByKey(ctx.state, id);
  return { milestoneId: m.id, key: milestoneKey(ctx.state, m), title: m.title };
}

function openDraft(ctx: Context, slug: string) {
  const r = ctx.state.releases.find((x) => x.project === slug && x.state === "draft");
  if (r === undefined) throw new Error(`${slug} has no draft`);
  return r;
}

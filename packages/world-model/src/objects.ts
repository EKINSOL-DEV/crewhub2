/**
 * Work objects (plan 4.2): a ticket's kind decides its look, its status decides its room, and an
 * in-progress ticket lies on a desk. Only loops fields decide how an object looks.
 */
import type { ProjectOut, TicketCard, TicketKind, TicketStatus } from "@crewhub/loops-client";
import { ticketKeys } from "./agents.ts";
import type { ReduceContext } from "./agents.ts";
import type { AgentKey, ObjectLook, RoomKind, WorkObject } from "./model.ts";

export const SPEECH_MARK_MS = 20_000;
export const CELEBRATION_MS = 6_000;

const LOOKS: Record<TicketKind, ObjectLook> = {
  task: "folder",
  feature: "box",
  bug: "bug-crate",
  question: "envelope",
};

const STATUS_ROOMS: Record<Exclude<TicketStatus, "in_progress">, RoomKind> = {
  backlog: "storage",
  planned: "planning",
  review: "review",
  done: "dispatch",
};

const STATUS_ORDER: TicketStatus[] = ["backlog", "planned", "in_progress", "review", "done"];

/** An agent that has a desk in this building: its key, room, whether it is a worker, and its status line. */
export interface DeskHolder {
  key: AgentKey;
  room: RoomKind;
  worker: boolean;
  lead: string | null;
  contextLine: string | null;
}

export interface BuiltObject {
  object: WorkObject;
  /** The assignee's principal id when it is an agent; for alerts. */
  assigneeId: string | null;
}

export function buildObjects(
  project: ProjectOut,
  cards: TicketCard[],
  desks: DeskHolder[],
  ctx: ReduceContext,
): BuiltObject[] {
  const sorted = [...cards].sort(
    (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.position - b.position,
  );
  return sorted.map((card) => {
    const assigneeId = card.assignee?.kind === "agent" ? card.assignee.id : null;
    const place = placeOf(card, project, assigneeId, desks, ctx);
    return { object: toObject(card, place, ctx), assigneeId };
  });
}

function placeOf(
  card: TicketCard,
  project: ProjectOut,
  assigneeId: string | null,
  desks: DeskHolder[],
  ctx: ReduceContext,
): { room: RoomKind; deskOf: AgentKey | null; deskInferred: boolean } {
  if (card.status !== "in_progress") return { room: STATUS_ROOMS[card.status], deskOf: null, deskInferred: false };
  // A worker whose status line names the key: an inference (plan 4.2, until loops proposal L3).
  const named = ctx.stale
    ? undefined
    : desks.find((d) => d.worker && d.lead === project.lead.id && ticketKeys(d.contextLine).includes(card.key));
  const assigneeDesk = assigneeId ? desks.find((d) => d.key === assigneeId) : undefined;
  // Leads delegate to their workers: a worker that names the key is more specific than its lead's desk.
  if (named && (!assigneeDesk || assigneeId === project.lead.id)) {
    return { room: named.room, deskOf: named.key, deskInferred: true };
  }
  if (assigneeDesk) return { room: assigneeDesk.room, deskOf: assigneeDesk.key, deskInferred: false };
  return { room: "lead-office", deskOf: null, deskInferred: false };
}

function toObject(
  card: TicketCard,
  place: { room: RoomKind; deskOf: AgentKey | null; deskInferred: boolean },
  ctx: ReduceContext,
): WorkObject {
  const { facts, now } = ctx;
  const openStall = facts.stalls[card.key];
  const stallState = openStall?.state ?? card.stall?.state ?? null;
  const quietSince = openStall?.quietSince ?? card.stall?.quietSince ?? null;
  let stall: WorkObject["stall"] = null;
  // An open state is shown only while the ticket is in progress (agents-and-states.md).
  if (card.status === "in_progress" && stallState && quietSince) {
    const since = Date.parse(quietSince);
    const quietMinutes = Number.isNaN(since)
      ? (openStall?.quietMinutes ?? null)
      : Math.max(0, Math.floor((now - since) / 60_000));
    stall = { state: stallState, quietSince, quietMinutes };
  }

  let speechMarkUntil: number | null = null;
  for (const comment of facts.comments) {
    if (comment.ticketId === card.id && comment.ts + SPEECH_MARK_MS > now) {
      speechMarkUntil = Math.max(speechMarkUntil ?? 0, comment.ts + SPEECH_MARK_MS);
    }
  }

  // Done is a person's decision: celebrate only a person's move to done.
  const move = facts.lastMoves[card.id];
  const celebrateUntil =
    move && move.to === "done" && move.actorKind === "user" && card.status === "done" && move.ts + CELEBRATION_MS > now
      ? move.ts + CELEBRATION_MS
      : null;

  const priorityTag = card.priority === "urgent" || card.priority === "high" ? card.priority : null;
  const waitingOn = card.waitingOn;
  return {
    ticketId: card.id,
    key: card.key,
    title: card.title,
    kind: card.kind,
    look: LOOKS[card.kind],
    status: card.status,
    room: place.room,
    deskOf: place.deskOf,
    deskInferred: place.deskInferred,
    position: card.position,
    priorityTag,
    blocked: card.blocked === true,
    sealed: card.held === true,
    stall,
    nameTag: waitingOn?.kind === "user" ? waitingOn.displayName : null,
    waitingOnHuman: card.waitingOnHuman === true,
    milestone: card.milestone ? { id: card.milestone.id, key: card.milestone.key, title: card.milestone.title } : null,
    labels: (card.labels ?? []).map((label) => label.name),
    speechMarkUntil,
    celebrateUntil,
  };
}

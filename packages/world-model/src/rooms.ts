/**
 * Rooms of a building (plan 4.2): the status rooms, the lobby and the lead's office always; a role
 * room once an agent of that role has been present; the meeting room only while the meeting
 * inference fires (plan 4.3).
 */
import { lineWorker, ticketKeys } from "./agents.ts";
import type { AgentEntity, ReduceContext } from "./agents.ts";
import type { AgentPlacement, RoleId, Room, RoomKind } from "./model.ts";

export const MEETING_WINDOW_MS = 10 * 60_000;

const LABELS: Record<RoomKind, string> = {
  lobby: "Lobby",
  "lead-office": "Lead's office",
  workers: "Workers room",
  analyst: "Analyst room",
  design: "Design room",
  storage: "Storage",
  planning: "Planning room",
  review: "Review room",
  dispatch: "Dispatch",
  meeting: "Meeting room",
};

const EMPTY_LABELS: Record<"workers" | "analyst" | "design", string> = {
  workers: "no worker agents active",
  analyst: "no analyst agents active",
  design: "no design agents active",
};

const ROLE_ROOMS: { role: RoleId; room: "workers" | "analyst" | "design" }[] = [
  { role: "worker", room: "workers" },
  { role: "analyst", room: "analyst" },
  { role: "design", room: "design" },
];

export function roomLabel(kind: RoomKind): string {
  return LABELS[kind];
}

export function buildRooms(
  slug: string,
  agents: AgentPlacement[],
  meetingKey: string | null,
  ctx: ReduceContext,
): Room[] {
  const room = (kind: RoomKind, present = true, emptyLabel: string | null = null, label = LABELS[kind]): Room => ({
    id: `${slug}:${kind}`,
    kind,
    label,
    present,
    emptyLabel,
  });
  const rooms: Room[] = [room("lobby"), room("lead-office")];
  const seen = (ctx.memory.roleRooms[slug] ??= {});
  for (const { role, room: kind } of ROLE_ROOMS) {
    const present = agents.some((a) => a.role === role);
    if (present && seen[role] === undefined) seen[role] = ctx.now;
    if (seen[role] !== undefined) rooms.push(room(kind, present, present ? null : EMPTY_LABELS[kind]));
  }
  rooms.push(room("storage"), room("planning"), room("review"), room("dispatch"));
  if (meetingKey) rooms.push(room("meeting", true, null, `${LABELS.meeting}: discussing ${meetingKey}`));
  return rooms;
}

/**
 * Inference (plan 4.3): two or more principals comment on one ticket within 10 minutes, or a lead
 * and one of its workers report the same key (progress lines within 10 minutes, or current status
 * lines). Returns the most recent such ticket key.
 */
export function meetingKey(slug: string, leadId: string, entities: AgentEntity[], ctx: ReduceContext): string | null {
  const { facts, now } = ctx;
  const since = now - MEETING_WINDOW_MS;
  let best: { key: string; ts: number } | null = null;
  const consider = (key: string, ts: number) => {
    if (!best || ts > best.ts) best = { key, ts };
  };

  const commenters = new Map<string, { actors: Set<string>; ts: number }>();
  for (const comment of facts.comments) {
    if (comment.slug !== slug || comment.ts < since || comment.ts > now) continue;
    const entry = commenters.get(comment.ticketKey) ?? { actors: new Set<string>(), ts: 0 };
    entry.actors.add(comment.actorId);
    entry.ts = Math.max(entry.ts, comment.ts);
    commenters.set(comment.ticketKey, entry);
  }
  for (const [key, entry] of commenters) if (entry.actors.size >= 2) consider(key, entry.ts);

  const reporters = new Map<string, { lead: boolean; worker: boolean; ts: number }>();
  for (const line of facts.progress) {
    if (line.agent !== leadId || line.ts < since || line.ts > now) continue;
    const entry = reporters.get(line.ticketKey) ?? { lead: false, worker: false, ts: 0 };
    if (lineWorker(line, facts)) entry.worker = true;
    else entry.lead = true;
    entry.ts = Math.max(entry.ts, line.ts);
    reporters.set(line.ticketKey, entry);
  }
  for (const [key, entry] of reporters) if (entry.lead && entry.worker) consider(key, entry.ts);

  if (!ctx.stale && facts.teamReceivedAt !== null) {
    const lead = entities.find((e) => e.key === leadId);
    const leadKeys = new Set(ticketKeys(lead?.lane?.contextLine));
    for (const worker of entities) {
      if (worker.registered || worker.lead !== leadId) continue;
      const shared = ticketKeys(worker.lane?.contextLine).find((key) => leadKeys.has(key));
      if (shared) consider(shared, facts.teamReceivedAt);
    }
  }
  const found = best as { key: string; ts: number } | null;
  return found?.key ?? null;
}

/**
 * Is this key one the world can read with? `GET /api/auth/me` says who it is, and one board read (`GET /api/projects`)
 * says whether it may read the board: a reader key (CL-313) answers `auth/me` but not the projects list, a probe key
 * (CL-295) answers nothing, the builder key reads tickets only. The verdict carries a reason a person can act on, in
 * the loops web's own words, and never the key.
 */
import type { LoopsClient } from "./loops.ts";

export type KeyVerdict = { state: "ok"; name: string; displayName: string } | { state: "rejected"; reason: string } | { state: "unreachable" };

const MAKE_A_BOT = 'In crewhub-loops open Settings > Agents > New external bot: name crewhub-world, "Read only" off, no projects; then paste its access key here.';
export const PROBE_REASON = `A probe key reads nothing since CL-295. ${MAKE_A_BOT}`;
export const READER_REASON = `Read-only bots cannot read the board (a "Read only" bot reads tickets of its projects only). ${MAKE_A_BOT}`;
export const BUILDER_REASON = `The builder key reads tickets of its member projects only. ${MAKE_A_BOT}`;
export const UNKNOWN_REASON = "crewhub-loops does not know this key: it was mistyped or revoked. In crewhub-loops open Settings > Agents > crewhub-world > New access key, copy it and paste it here.";
export const PERSON_REASON = "That is a person's session, not an agent's access key. " + MAKE_A_BOT;

interface ErrorBody {
  error?: { code?: unknown; message?: unknown };
}

/** The reason behind a 403, from loops' message. */
export function refusalReason(message: string): string {
  if (/probe key/i.test(message)) return PROBE_REASON;
  if (/rules only/i.test(message)) return READER_REASON;
  if (/attachments only/i.test(message)) return BUILDER_REASON;
  return `crewhub-loops refused the key: ${message}`;
}

const messageOf = (body: unknown): string => {
  const error = (body as ErrorBody | null)?.error;
  return typeof error?.message === "string" ? error.message : "no reason given";
};

export async function checkKey(client: LoopsClient): Promise<KeyVerdict> {
  let me: { status: number; body: unknown };
  try {
    me = await client.getJson("/api/auth/me");
  } catch {
    return { state: "unreachable" };
  }
  if (me.status === 401) return { state: "rejected", reason: UNKNOWN_REASON };
  if (me.status === 403) return { state: "rejected", reason: refusalReason(messageOf(me.body)) };
  if (me.status !== 200) return { state: "rejected", reason: `crewhub-loops answered ${me.status} to GET /api/auth/me: is that crewhub-loops?` };
  const principal = (me.body as { principal?: { id?: unknown; kind?: unknown; role?: unknown; displayName?: unknown } } | null)?.principal;
  if (principal === undefined || typeof principal.id !== "string") return { state: "rejected", reason: "crewhub-loops answered GET /api/auth/me without a principal: is that crewhub-loops?" };
  if (principal.kind !== "agent") return { state: "rejected", reason: PERSON_REASON };
  if (principal.role === "probe") return { state: "rejected", reason: PROBE_REASON };
  let projects: { status: number; body: unknown };
  try {
    projects = await client.getJson("/api/projects");
  } catch {
    return { state: "unreachable" };
  }
  if (projects.status === 403) return { state: "rejected", reason: refusalReason(messageOf(projects.body)) };
  if (projects.status === 401) return { state: "rejected", reason: UNKNOWN_REASON };
  if (projects.status !== 200) return { state: "rejected", reason: `crewhub-loops answered ${projects.status} to GET /api/projects` };
  return { state: "ok", name: principal.id, displayName: typeof principal.displayName === "string" ? principal.displayName : principal.id };
}

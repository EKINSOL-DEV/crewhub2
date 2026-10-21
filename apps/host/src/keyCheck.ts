/**
 * Is this key one the world can read with? `GET /api/auth/me` says who it is, and one board read (`GET /api/projects`)
 * says whether it may read the board: a reader key (CL-313) answers `auth/me` but not the projects list, a probe key
 * (CL-295) answers nothing, the builder key reads tickets only. The verdict carries a reason a person can act on, in
 * the loops web's own words, and never the key.
 *
 * A key is `rejected` only on a definite 401 or 403 from a loops whose health answers (`healthy`, the keyless
 * `GET /api/health`): a timeout, a refused connection, a 5xx, an answer that is not loops' or a loops that is
 * restarting is `unreachable`, with the reason for the log, and says nothing about the key.
 */
import type { LoopsClient } from "./loops.ts";

export type KeyVerdict = { state: "ok"; name: string; displayName: string } | { state: "rejected"; reason: string } | { state: "unreachable"; reason: string };

/** Does loops answer its health right now? The default trusts the caller: a plain 401/403 counts. */
export type HealthProbe = () => Promise<boolean>;

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

const NOT_ANSWERING = "crewhub-loops did not answer (a timeout or a refused connection)";

export async function checkKey(client: LoopsClient, healthy: HealthProbe = async () => true): Promise<KeyVerdict> {
  /** A 401 or 403 is a verdict on the key only when loops itself is up; otherwise nothing is known. */
  const refused = async (reason: string, status: number, path: string): Promise<KeyVerdict> =>
    (await healthy()) ? { state: "rejected", reason } : { state: "unreachable", reason: `${path} answered ${status} but crewhub-loops' health does not answer: restarting?` };
  let me: { status: number; body: unknown };
  try {
    me = await client.getJson("/api/auth/me");
  } catch {
    return { state: "unreachable", reason: NOT_ANSWERING };
  }
  if (me.status === 401) return refused(UNKNOWN_REASON, 401, "GET /api/auth/me");
  if (me.status === 403) return refused(refusalReason(messageOf(me.body)), 403, "GET /api/auth/me");
  if (me.status !== 200) return { state: "unreachable", reason: `crewhub-loops answered ${me.status} to GET /api/auth/me (${me.status >= 500 ? "restarting or in trouble" : "is that crewhub-loops?"})` };
  const principal = (me.body as { principal?: { id?: unknown; kind?: unknown; role?: unknown; displayName?: unknown } } | null)?.principal;
  if (principal === undefined || typeof principal.id !== "string") return { state: "unreachable", reason: "GET /api/auth/me answered without a principal: is that crewhub-loops?" };
  if (principal.kind !== "agent") return { state: "rejected", reason: PERSON_REASON };
  if (principal.role === "probe") return { state: "rejected", reason: PROBE_REASON };
  let projects: { status: number; body: unknown };
  try {
    projects = await client.getJson("/api/projects");
  } catch {
    return { state: "unreachable", reason: NOT_ANSWERING };
  }
  if (projects.status === 403) return refused(refusalReason(messageOf(projects.body)), 403, "GET /api/projects");
  if (projects.status === 401) return refused(UNKNOWN_REASON, 401, "GET /api/projects");
  if (projects.status !== 200) return { state: "unreachable", reason: `crewhub-loops answered ${projects.status} to GET /api/projects` };
  return { state: "ok", name: principal.id, displayName: typeof principal.displayName === "string" ? principal.displayName : principal.id };
}

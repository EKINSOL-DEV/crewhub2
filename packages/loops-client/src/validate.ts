/**
 * Hand-written runtime validators for the loops wire shapes (loops publishes no schemas yet,
 * proposal L2). Unknown keys are ignored and dropped (stability.md "ignore what you do not know").
 * New values of `reason`, `state` and `resolution` in event payloads are tolerated; a `v` other
 * than 1 on an envelope or a team snapshot fails loudly.
 */
import type { LoopsSnapshot } from "./source.ts";
import {
  COMMENT_KINDS,
  DELIVERY_REASONS,
  DELIVERY_STATES,
  DM_MESSAGE_STATES,
  ESCALATION_OUTCOMES,
  MILESTONE_STATES,
  PRINCIPAL_KINDS,
  PROGRESS_KINDS,
  PROGRESS_SOURCES,
  PROJECT_COLORS,
  PROJECT_ICONS,
  RELEASE_APP_NOTE_STATES,
  RELEASE_SCHEMES,
  RELEASE_STATES,
  STALL_STATES,
  SYSTEM_COMMENT_CODES,
  TICKET_KINDS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  WATCHDOG_MODES,
  isWorldEventType,
} from "./types.ts";
import type {
  ActorRef,
  AgentOut,
  AgentsResponse,
  BoardColumn,
  BoardResponse,
  CommentOut,
  CommentsResponse,
  DeliveryOut,
  DmMessage,
  DmMessagesResponse,
  DmThread,
  DmThreadsResponse,
  EffectiveRoute,
  Envelope,
  EventProjectRef,
  EventTicketRef,
  LabelOut,
  LinkChip,
  MilestoneRef,
  MilestoneSummary,
  MilestonesResponse,
  PrincipalOut,
  PrincipalRef,
  PrincipalsResponse,
  ProgressItem,
  ProgressResponse,
  ProjectOut,
  ProjectRef,
  ProjectsResponse,
  RelationRef,
  ReleaseAppNote,
  ReleaseRef,
  ReleaseSummary,
  ReleasesResponse,
  RichBody,
  StallDetail,
  StallSummary,
  StatusCounts,
  TeamAgent,
  TeamSession,
  TeamSnapshot,
  Ticket,
  TicketCard,
  TicketSummary,
  WatchdogItem,
  WatchdogResponse,
  WatchdogTransport,
  WorldEvent,
  WorldEventPayloads,
  WorldEventType,
} from "./types.ts";

// Combinators

export type Result<T> = { ok: true; value: T } | { ok: false; path: string; message: string };

export type Validator<T> = ((input: unknown, path: string) => Result<T>) & { optional?: true };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (path: string, message: string): { ok: false; path: string; message: string } => ({
  ok: false,
  path,
  message,
});

const describe = (input: unknown): string =>
  input === null ? "null" : Array.isArray(input) ? "array" : typeof input;

export const str: Validator<string> = (input, path) =>
  typeof input === "string" ? ok(input) : fail(path, `expected string, got ${describe(input)}`);

export const num: Validator<number> = (input, path) =>
  typeof input === "number" && Number.isFinite(input)
    ? ok(input)
    : fail(path, `expected number, got ${describe(input)}`);

export const int: Validator<number> = (input, path) =>
  Number.isInteger(input) ? ok(input as number) : fail(path, `expected integer, got ${describe(input)}`);

export const bool: Validator<boolean> = (input, path) =>
  typeof input === "boolean" ? ok(input) : fail(path, `expected boolean, got ${describe(input)}`);

/** Any value, kept as it is (bodies and shapes the world never reads). */
export const unknownValue: Validator<unknown> = (input) => ok(input);

export function literal<const T extends string | number>(expected: T): Validator<T> {
  return (input, path) =>
    input === expected ? ok(expected) : fail(path, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(input)}`);
}

export function oneOf<const T extends string>(values: readonly T[]): Validator<T> {
  return (input, path) =>
    typeof input === "string" && (values as readonly string[]).includes(input)
      ? ok(input as T)
      : fail(path, `expected one of ${values.join(", ")}, got ${JSON.stringify(input)}`);
}

export function nullable<T>(validator: Validator<T>): Validator<T | null> {
  return (input, path) => (input === null ? ok(null) : validator(input, path));
}

/** Marks an object key as optional: a missing key (or `undefined`) is left out of the result. */
export function optional<T>(validator: Validator<T>): Validator<T> {
  const wrapped: Validator<T> = (input, path) => validator(input, path);
  wrapped.optional = true;
  return wrapped;
}

export function union<A, B>(a: Validator<A>, b: Validator<B>): Validator<A | B> {
  return (input, path) => {
    const first = a(input, path);
    return first.ok ? first : b(input, path);
  };
}

export function arrayOf<T>(item: Validator<T>): Validator<T[]> {
  return (input, path) => {
    if (!Array.isArray(input)) return fail(path, `expected array, got ${describe(input)}`);
    const out: T[] = [];
    for (let i = 0; i < input.length; i += 1) {
      const result = item(input[i], `${path}[${i}]`);
      if (!result.ok) return result;
      out.push(result.value);
    }
    return ok(out);
  };
}

export function recordOf<T>(item: Validator<T>): Validator<Record<string, T>> {
  return (input, path) => {
    if (!isPlainObject(input)) return fail(path, `expected object, got ${describe(input)}`);
    const out: Record<string, T> = {};
    for (const [key, value] of Object.entries(input)) {
      const result = item(value, `${path}.${key}`);
      if (!result.ok) return result;
      out[key] = result.value;
    }
    return ok(out);
  };
}

export type Shape<T> = { [K in keyof T]-?: Validator<T[K]> };

/** An object with the given keys; unknown keys are dropped, optional keys may be missing. */
export function object<T>(shape: Shape<T>): Validator<T> {
  const entries = Object.entries(shape) as [string, Validator<unknown>][];
  return (input, path) => {
    if (!isPlainObject(input)) return fail(path, `expected object, got ${describe(input)}`);
    const out: Record<string, unknown> = {};
    for (const [key, validator] of entries) {
      const value = input[key];
      if (value === undefined) {
        if (validator.optional) continue;
        return fail(`${path}.${key}`, "missing required key");
      }
      const result = validator(value, `${path}.${key}`);
      if (!result.ok) return result;
      out[key] = result.value;
    }
    return ok(out as T);
  };
}

function isPlainObject(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

const run =
  <T>(validator: Validator<T>) =>
  (input: unknown): Result<T> =>
    validator(input, "$");

// Shared pieces

const principalRef = object<PrincipalRef>({
  id: str,
  kind: oneOf(PRINCIPAL_KINDS),
  displayName: str,
});

const projectRef = object<ProjectRef>({ slug: str, key: str });

const statusCounts = object<StatusCounts>({
  backlog: int,
  planned: int,
  in_progress: int,
  review: int,
  done: int,
});

const effectiveRoute = object<EffectiveRoute>({
  agent: str,
  session: optional(nullable(str)),
  source: optional(nullable(oneOf(["agent", "project"] as const))),
});

const projectOut = object<ProjectOut>({
  id: str,
  slug: str,
  key: str,
  name: str,
  lead: principalRef,
  herdrSession: optional(nullable(str)),
  counts: statusCounts,
  assigneeCounts: optional(recordOf(int)),
  releaseScheme: optional(nullable(oneOf(RELEASE_SCHEMES))),
  releaseRepo: optional(nullable(str)),
  appNote: optional(oneOf(["none", "crewhub", "own"] as const)),
  rootFolder: optional(nullable(str)),
  extraFolders: optional(arrayOf(str)),
  revision: optional(int),
  color: optional(nullable(oneOf(PROJECT_COLORS))),
  icon: optional(nullable(oneOf(PROJECT_ICONS))),
  description: optional(str),
  archivedAt: optional(nullable(str)),
  archivedBy: optional(nullable(principalRef)),
  effectiveRoute,
  repoCount: optional(int),
  ticketTotal: optional(int),
  keyLocked: optional(bool),
});

const labelOut = object<LabelOut>({
  id: str,
  projectId: optional(nullable(str)),
  name: str,
  color: oneOf(PROJECT_COLORS),
  revision: optional(int),
  usage: optional(nullable(int)),
});

const stallSummary = object<StallSummary>({
  state: oneOf(STALL_STATES),
  quietSince: str,
  nudges: optional(int),
});

const stallDetail = object<StallDetail>({
  state: oneOf(STALL_STATES),
  quietSince: str,
  detectedAt: str,
  quietMinutes: int,
  nudges: optional(int),
  lastNudgeAt: optional(nullable(str)),
  deliveryRecipientId: optional(nullable(str)),
  escalatedAt: optional(nullable(str)),
  escalationOutcome: optional(nullable(oneOf(ESCALATION_OUTCOMES))),
});

const milestoneRef = object<MilestoneRef>({
  id: str,
  key: str,
  number: int,
  title: str,
  state: oneOf(MILESTONE_STATES),
});

const linkChip = object<LinkChip>({
  type: str,
  ref: str,
  title: optional(nullable(str)),
  status: optional(nullable(str)),
});

const cardShape: Shape<TicketCard> = {
  id: str,
  key: str,
  title: str,
  kind: oneOf(TICKET_KINDS),
  status: oneOf(TICKET_STATUSES),
  priority: oneOf(TICKET_PRIORITIES),
  position: num,
  version: int,
  assignee: optional(nullable(principalRef)),
  waitingOn: optional(nullable(principalRef)),
  labels: optional(arrayOf(labelOut)),
  commentCount: optional(int),
  attachmentCount: optional(int),
  agentWorking: optional(bool),
  stall: optional(nullable(stallSummary)),
  waitingOnHuman: optional(bool),
  milestone: optional(nullable(milestoneRef)),
  held: optional(bool),
  blocked: optional(bool),
  updatedAt: str,
  statusChangedAt: str,
  links: optional(arrayOf(linkChip)),
};

const ticketCard = object<TicketCard>(cardShape);

const ticketSummary = object<TicketSummary>({
  ...cardShape,
  project: projectRef,
  createdAt: str,
  closedAt: optional(nullable(str)),
});

const releaseRef = object<ReleaseRef>({
  id: str,
  number: int,
  version: optional(nullable(str)),
  title: str,
  state: oneOf(RELEASE_STATES),
  deletedAt: optional(nullable(str)),
});

const relationRef = object<RelationRef>({
  id: str,
  key: str,
  title: str,
  status: oneOf(TICKET_STATUSES),
  active: bool,
});

const richBody = object<RichBody>({
  v: optional(literal("1")),
  profile: optional(literal("ticket")),
  doc: recordOf(unknownValue),
});

const ticket = object<Ticket>({
  ...cardShape,
  project: projectRef,
  createdAt: str,
  closedAt: optional(nullable(str)),
  archivedAt: optional(nullable(str)),
  release: optional(nullable(releaseRef)),
  stallDetail: optional(nullable(stallDetail)),
  blockedBy: optional(arrayOf(relationRef)),
  blocking: optional(arrayOf(relationRef)),
  links: optional(arrayOf(unknownValue)),
  body: optional(nullable(richBody)),
  bodyMarkdown: optional(nullable(str)),
  attachments: optional(arrayOf(unknownValue)),
  createdBy: principalRef,
  seedId: optional(nullable(str)),
});

const commentOut = object<CommentOut>({
  id: str,
  ticketId: str,
  parentId: optional(nullable(str)),
  rootId: str,
  author: principalRef,
  kind: oneOf(COMMENT_KINDS),
  systemCode: optional(nullable(oneOf(SYSTEM_COMMENT_CODES))),
  deliveryId: optional(nullable(str)),
  body: optional(unknownValue),
  bodyMarkdown: optional(nullable(str)),
  attachments: optional(arrayOf(unknownValue)),
  createdAt: str,
  editedAt: optional(nullable(str)),
  deletedAt: optional(nullable(str)),
});

const progressItem = object<ProgressItem>({
  id: int,
  agent: principalRef,
  kind: oneOf(PROGRESS_KINDS),
  text: str,
  worker: optional(nullable(str)),
  source: oneOf(PROGRESS_SOURCES),
  createdAt: str,
});

const boardColumn = object<BoardColumn>({
  status: oneOf(TICKET_STATUSES),
  tickets: arrayOf(ticketCard),
});

const boardResponse = object<BoardResponse>({ columns: arrayOf(boardColumn) });

const milestoneSummary = object<MilestoneSummary>({
  id: str,
  key: str,
  number: int,
  title: str,
  state: oneOf(MILESTONE_STATES),
  project: projectRef,
  targetDate: optional(nullable(str)),
  position: num,
  owner: optional(nullable(principalRef)),
  createdAt: str,
  updatedAt: str,
  startedAt: optional(nullable(str)),
  completedAt: optional(nullable(str)),
  archivedAt: optional(nullable(str)),
  revision: int,
});

const releaseAppNote = object<ReleaseAppNote>({
  state: oneOf(RELEASE_APP_NOTE_STATES),
  url: optional(nullable(str)),
  reason: optional(nullable(str)),
});

const releaseSummary = object<ReleaseSummary>({
  id: str,
  number: int,
  version: optional(nullable(str)),
  title: str,
  state: oneOf(RELEASE_STATES),
  deletedAt: optional(nullable(str)),
  project: projectRef,
  ticketCount: int,
  createdAt: str,
  publishedAt: optional(nullable(str)),
  githubTagUrl: optional(nullable(str)),
  tagSha: optional(nullable(str)),
  appNote: releaseAppNote,
});

const teamAgent = object<TeamAgent>({
  name: str,
  status: str,
  paneId: optional(nullable(str)),
  workspaceId: optional(nullable(str)),
  contextLine: optional(nullable(str)),
  lead: optional(nullable(str)),
  unsentInput: optional(nullable(oneOf(["typed", "unknown"] as const))),
});

const teamSession = object<TeamSession>({ name: str, agents: arrayOf(teamAgent) });

const teamSnapshot = object<TeamSnapshot>({
  // read-model.md types it as the string "1", team-and-projects.md shows the number 1.
  v: optional(union(literal("1"), literal(1))),
  ts: str,
  sessions: arrayOf(teamSession),
});

export const deliveryOut = object<DeliveryOut>({
  id: str,
  eventSeq: int,
  recipientId: str,
  ticketId: nullable(str),
  dmMessageId: optional(nullable(str)),
  commentId: optional(nullable(str)),
  reason: oneOf(DELIVERY_REASONS),
  state: oneOf(DELIVERY_STATES),
  attempts: int,
  attemptId: optional(nullable(str)),
  attemptedSession: optional(nullable(str)),
  leaseUntil: optional(nullable(str)),
  nextAttemptAt: optional(nullable(str)),
  lastError: optional(nullable(str)),
  seenAt: optional(nullable(str)),
  createdAt: str,
  updatedAt: str,
});

const dmThread = object<DmThread>({
  id: str,
  agentId: str,
  createdAt: str,
  lastMessageAt: str,
  unreadCount: int,
});

const dmMessage = object<DmMessage>({
  id: str,
  threadId: str,
  author: principalRef,
  body: richBody,
  bodyMarkdown: str,
  bodyText: str,
  replyTo: nullable(str),
  clientId: str,
  createdAt: str,
  deliveryId: nullable(str),
  deliveryState: nullable(oneOf(DELIVERY_STATES)),
  deliveryError: nullable(str),
  answeredAt: nullable(str),
  state: oneOf(DM_MESSAGE_STATES),
});

const watchdogTransport = object<WatchdogTransport>({
  oldestPendingDeliveryS: optional(nullable(int)),
  unsentNotifications: optional(int),
  inputObstructed: optional(int),
});

const watchdogItem = object<WatchdogItem>({ ticket: ticketSummary, stall: stallDetail });

const watchdogResponse = object<WatchdogResponse>({
  mode: oneOf(WATCHDOG_MODES),
  lastTickAt: optional(nullable(str)),
  stopped: optional(bool),
  lastError: optional(nullable(str)),
  monitoring: optional(str),
  transport: optional(watchdogTransport),
  openStalled: optional(int),
  openAttention: optional(int),
  open: optional(arrayOf(watchdogItem)),
});

const agentOut = object<AgentOut>({
  id: str,
  displayName: str,
  role: str,
  herdrSession: nullable(str),
  disabled: bool,
  lastSeenAt: nullable(str),
  keys: nullable(arrayOf(unknownValue)),
  isCrewhubLead: optional(bool),
  successorId: optional(nullable(str)),
  projects: optional(arrayOf(str)),
  lane: optional(unknownValue),
  rights: optional(unknownValue),
  revision: optional(int),
});

const principalOut = object<PrincipalOut>({ id: str, kind: oneOf(PRINCIPAL_KINDS), displayName: str });

// Envelopes and payloads

const envelope = object<Envelope>({
  v: literal(1),
  seq: int,
  ts: str,
  type: str,
  project: nullable(object<EventProjectRef>({ slug: str, key: str })),
  ticket: nullable(object<EventTicketRef>({ id: str, key: str, title: str })),
  actor: object<ActorRef>({ id: str, kind: oneOf(PRINCIPAL_KINDS) }),
  recipientIds: arrayOf(str),
  payload: recordOf(unknownValue),
});

const changePayload = { changed: arrayOf(str), old: optional(unknownValue), new: optional(unknownValue) };
const milestoneBase = { milestoneId: str, key: str, title: str };
const commentPayload = object<WorldEventPayloads["comment.created"]>({ commentId: str, parentId: nullable(str) });
const dmPayload = object<WorldEventPayloads["dm.created"]>({ threadId: str, messageId: str, agentId: str });
const milestonePayload = object<WorldEventPayloads["milestone.created"]>(milestoneBase);
const handoffPayload = object<WorldEventPayloads["milestone.handoff"]>({
  ...milestoneBase,
  handoffId: str,
  count: int,
  recipientId: str,
});
const projectChange = object<WorldEventPayloads["project.updated"]>(
  changePayload as Shape<WorldEventPayloads["project.updated"]>,
);

const payloadValidators: { [T in WorldEventType]: Validator<WorldEventPayloads[T]> } = {
  "ticket.created": object({ kind: oneOf(TICKET_KINDS), status: oneOf(TICKET_STATUSES), assigneeId: nullable(str) }),
  "ticket.updated": object({
    changed: arrayOf(str),
    newMentions: optional(unknownValue),
    milestone: optional(unknownValue),
    reason: optional(str),
    relation: optional(unknownValue),
    unblockedBy: optional(unknownValue),
    how: optional(str),
    code: optional(str),
  }),
  "ticket.moved": object({
    from: oneOf(TICKET_STATUSES),
    to: oneOf(TICKET_STATUSES),
    position: num,
    renumbered: optional(unknownValue),
    waitingOnCleared: optional(bool),
    labelsCleared: optional(bool),
    reason: optional(str),
    code: optional(str),
    milestoneId: optional(str),
    handoffId: optional(str),
  }),
  "ticket.archived": object({
    batchId: nullable(str),
    batchSize: nullable(int),
    releaseId: nullable(str),
    reason: str,
  }),
  "ticket.unarchived": object({ batchId: nullable(str), releaseId: nullable(str) }),
  "ticket.progress": object({ ticket: str, agent: str, kind: oneOf(PROGRESS_KINDS), text: str }),
  "ticket.stalled": object({
    ticket: str,
    agent: str,
    episode: unknownValue,
    reason: str,
    quietSince: str,
    quietMinutes: int,
    members: arrayOf(object({ name: str, status: str })),
    nudge: unknownValue,
  }),
  "ticket.resumed": object({
    ticket: str,
    agent: str,
    episode: unknownValue,
    resolution: str,
    minutes: int,
    deliveryId: optional(str),
  }),
  "comment.created": commentPayload,
  "comment.updated": commentPayload,
  "comment.deleted": commentPayload,
  "delivery.created": object({ deliveryId: str, recipientId: str, reason: str, dmThreadId: optional(str) }),
  "delivery.updated": object({ deliveryId: str, state: str, dmThreadId: optional(str) }),
  "dm.created": dmPayload,
  "dm.answered": dmPayload,
  "team.updated": (_input, _path) => ok({}),
  "project.created": object({ slug: str, key: str, leadId: str, ...changePayload } as Shape<
    WorldEventPayloads["project.created"]
  >),
  "project.updated": projectChange,
  "project.archived": projectChange,
  "project.restored": projectChange,
  "project.reordered": object({ slugs: arrayOf(str) }),
  "milestone.created": milestonePayload,
  "milestone.updated": object({ ...milestoneBase, ...changePayload } as Shape<
    WorldEventPayloads["milestone.updated"]
  >),
  "milestone.completed": milestonePayload,
  "milestone.cancelled": milestonePayload,
  "milestone.archived": milestonePayload,
  "milestone.restored": milestonePayload,
  "milestone.tickets_attached": object({ ...milestoneBase, ticketIds: arrayOf(str) }),
  "milestone.tickets_detached": object({ ...milestoneBase, ticketIds: arrayOf(str), reason: str }),
  "milestone.handoff": handoffPayload,
  "milestone.handoff_withdrawn": handoffPayload,
  "release.created": object({ releaseId: str, number: int, count: int }),
  "release.updated": object({ releaseId: str, revision: int, changed: arrayOf(str), code: optional(str) }),
  "release.published": object({ releaseId: str, revision: int, version: nullable(str) }),
  "release.deleted": object({ releaseId: str, tombstone: bool }),
};

// Public entry points

/** The envelope only; the payload stays a loose record. `v` other than 1 fails. */
export const validateEnvelope = run(envelope);

/**
 * Types a valid envelope by its payload. `null` when the type is not on the world's allowlist
 * (skip it, never an error); a failure when an allowlisted payload does not match events.md.
 */
export function toWorldEvent(env: Envelope): Result<WorldEvent> | null {
  if (!isWorldEventType(env.type)) return null;
  const payload = payloadValidators[env.type](env.payload, "$.payload");
  if (!payload.ok) return payload;
  return ok({ ...env, type: env.type, payload: payload.value } as WorldEvent);
}

export const validateProjectsResponse = run(
  object<ProjectsResponse>({
    projects: arrayOf(projectOut),
    orderRevision: optional(int),
    linkTypesVersion: optional(str),
  }),
);
export const validateProjectOut = run(projectOut);
export const validateBoardResponse = run(boardResponse);
export const validateTeamSnapshot = run(teamSnapshot);
export const validateTicket = run(ticket);
export const validateTicketSummary = run(ticketSummary);
export const validateWatchdogResponse = run(watchdogResponse);
export const validateMilestonesResponse = run(
  object<MilestonesResponse>({ nextCursor: optional(nullable(str)), milestones: arrayOf(milestoneSummary) }),
);
export const validateReleasesResponse = run(
  object<ReleasesResponse>({ nextCursor: optional(nullable(str)), releases: arrayOf(releaseSummary) }),
);
export const validateDmThreadsResponse = run(object<DmThreadsResponse>({ threads: arrayOf(dmThread) }));
export const validateDmMessagesResponse = run(
  object<DmMessagesResponse>({ messages: arrayOf(dmMessage), nextCursor: nullable(str) }),
);
export const validateCommentsResponse = run(
  object<CommentsResponse>({ nextCursor: optional(nullable(str)), comments: arrayOf(commentOut) }),
);
export const validateProgressResponse = run(
  object<ProgressResponse>({ nextCursor: optional(nullable(str)), progress: arrayOf(progressItem) }),
);
export const validateDeliveryOut = run(deliveryOut);
/** `GET /api/agents`: `{agents: [...]}`. */
export const validateAgents = run(object<AgentsResponse>({ agents: arrayOf(agentOut) }));
/** `GET /api/principals`: `{principals: [...]}`. */
export const validatePrincipals = run(object<PrincipalsResponse>({ principals: arrayOf(principalOut) }));

export const validateLoopsSnapshot = run(
  object<LoopsSnapshot>({
    cursor: int,
    projects: arrayOf(projectOut),
    archivedProjects: arrayOf(projectOut),
    boards: recordOf(boardResponse),
    team: teamSnapshot,
    agents: arrayOf(agentOut),
    principals: arrayOf(principalOut),
    watchdog: watchdogResponse,
    milestones: recordOf(arrayOf(milestoneSummary)),
    releases: recordOf(arrayOf(releaseSummary)),
  }),
);

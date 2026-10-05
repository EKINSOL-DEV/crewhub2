/**
 * crewhub-loops wire types, transcribed from `docs/integrators/read-model.md` "Schemas" and
 * `docs/integrators/events.md` (loops commit a1bed0f), and checked against the loops code at
 * f55d1288 where the documents and the code differ (docs/LOOPS_GAP_ANALYSIS.md, D1 to D3 and D5):
 * the agents answer, `RichBody.v`, `labelsCleared` and a ticket's `resolution`. `?` keys are optional
 * properties; `| null` stays. Only the models CrewHub World reads are here. Bodies the world never
 * reads are `unknown`.
 */

export const TICKET_STATUSES = ["backlog", "planned", "in_progress", "review", "done"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_KINDS = ["task", "feature", "bug", "question"] as const;
export type TicketKind = (typeof TICKET_KINDS)[number];

export const TICKET_PRIORITIES = ["urgent", "high", "normal", "low"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const PRINCIPAL_KINDS = ["user", "agent", "system"] as const;
export type PrincipalKind = (typeof PRINCIPAL_KINDS)[number];

export const PROJECT_COLORS = ["coral", "tangerine", "circle", "mist", "ink"] as const;
export type ProjectColor = (typeof PROJECT_COLORS)[number];

export const PROJECT_ICONS = ["home", "inbox", "bot", "spark", "users", "star", "folder"] as const;
export type ProjectIcon = (typeof PROJECT_ICONS)[number];

export const STALL_STATES = ["stalled", "attention"] as const;
export type StallState = (typeof STALL_STATES)[number];

export const MILESTONE_STATES = ["planned", "active", "done", "cancelled"] as const;
export type MilestoneState = (typeof MILESTONE_STATES)[number];

export const RELEASE_STATES = ["draft", "published"] as const;
export type ReleaseState = (typeof RELEASE_STATES)[number];

export const RELEASE_SCHEMES = ["date", "semver"] as const;
export type ReleaseScheme = (typeof RELEASE_SCHEMES)[number];

export const PROGRESS_KINDS = ["start", "update", "done", "question"] as const;
export type ProgressKind = (typeof PROGRESS_KINDS)[number];

export const PROGRESS_SOURCES = ["herdr", "cli"] as const;
export type ProgressSource = (typeof PROGRESS_SOURCES)[number];

/** Lane statuses of the team snapshot (agents-and-states.md). The wire type is `string`. */
export const LANE_STATUSES = ["working", "idle", "done", "blocked", "unknown"] as const;
export type LaneStatus = (typeof LANE_STATUSES)[number];

export const DELIVERY_STATES = [
  "pending",
  "claimed",
  "forwarded",
  "uncertain",
  "unroutable",
  "obsolete",
] as const;
export type DeliveryState = (typeof DELIVERY_STATES)[number];

export const DELIVERY_REASONS = [
  "new_ticket",
  "assigned",
  "comment",
  "mention",
  "quick_ask",
  "planned",
  "release",
  "stalled",
  "unblocked",
  "dm",
] as const;
export type DeliveryReason = (typeof DELIVERY_REASONS)[number];

export const COMMENT_KINDS = ["normal", "system"] as const;
export type CommentKind = (typeof COMMENT_KINDS)[number];

export const SYSTEM_COMMENT_CODES = ["forwarded", "retrying", "uncertain", "unroutable"] as const;
export type SystemCommentCode = (typeof SYSTEM_COMMENT_CODES)[number];

export const WATCHDOG_MODES = ["off", "observe", "nudge"] as const;
export type WatchdogMode = (typeof WATCHDOG_MODES)[number];

export const AGENT_ROLES = ["lead", "router", "probe"] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

export const DM_MESSAGE_STATES = ["queued", "delivered", "answered"] as const;
export type DmMessageState = (typeof DM_MESSAGE_STATES)[number];

export const RELEASE_APP_NOTE_STATES = ["n/a", "pending", "posted", "skipped"] as const;
export type ReleaseAppNoteState = (typeof RELEASE_APP_NOTE_STATES)[number];

export const ESCALATION_OUTCOMES = ["pending", "sent", "uncertain"] as const;
export type EscalationOutcome = (typeof ESCALATION_OUTCOMES)[number];

export type StatusCounts = Record<TicketStatus, number>;

// Projects

export interface PrincipalRef {
  id: string;
  kind: PrincipalKind;
  displayName: string;
}

export interface EffectiveRoute {
  agent: string;
  session?: string | null;
  source?: "agent" | "project" | null;
}

export interface ProjectOut {
  id: string;
  slug: string;
  key: string;
  name: string;
  lead: PrincipalRef;
  herdrSession?: string | null;
  counts: StatusCounts;
  assigneeCounts?: Record<string, number>;
  releaseScheme?: ReleaseScheme | null;
  releaseRepo?: string | null;
  appNote?: "none" | "crewhub" | "own";
  rootFolder?: string | null;
  extraFolders?: string[];
  revision?: number;
  color?: ProjectColor | null;
  icon?: ProjectIcon | null;
  description?: string;
  archivedAt?: string | null;
  archivedBy?: PrincipalRef | null;
  effectiveRoute: EffectiveRoute;
  repoCount?: number;
  ticketTotal?: number;
  keyLocked?: boolean;
  /**
   * FUTURE (proposal L22 "project groups"): the group the project belongs to. crewhub-loops does not send it today;
   * only the demo does, so the world's zones have something to read.
   */
  groupId?: string | null;
}

/**
 * FUTURE (proposal L22 "project groups"): a level above projects, in the shape the world would like crewhub-loops to
 * offer. Nothing in crewhub-loops has it today; the name is neutral on purpose (loops decides whether it is an area,
 * a workspace, a team or a category). The world reads a group as a zone: a district of the town.
 */
export interface ProjectGroup {
  id: string;
  slug: string;
  name: string;
  /** Sidebar order, ascending. */
  order: number;
  color: ProjectColor | null;
  icon: ProjectIcon | null;
}

/** FUTURE (proposal L22): `GET /api/project-groups`. */
export interface ProjectGroupsResponse {
  groups: ProjectGroup[];
}

export interface ProjectsResponse {
  projects: ProjectOut[];
  orderRevision?: number;
  linkTypesVersion?: string;
}

export interface ProjectResponse {
  project: ProjectOut;
}

export interface ProjectRef {
  slug: string;
  key: string;
}

// Tickets

export interface LabelOut {
  id: string;
  projectId?: string | null;
  name: string;
  color: ProjectColor;
  revision?: number;
  usage?: number | null;
}

export interface StallSummary {
  state: StallState;
  quietSince: string;
  nudges?: number;
}

export interface StallDetail {
  state: StallState;
  quietSince: string;
  detectedAt: string;
  quietMinutes: number;
  nudges?: number;
  lastNudgeAt?: string | null;
  deliveryRecipientId?: string | null;
  escalatedAt?: string | null;
  escalationOutcome?: EscalationOutcome | null;
}

export interface MilestoneRef {
  id: string;
  key: string;
  number: number;
  title: string;
  state: MilestoneState;
}

export interface LinkChip {
  type: string;
  ref: string;
  title?: string | null;
  status?: string | null;
}

/** The fields every ticket shape (card, summary, full ticket) shares. */
export interface TicketCard {
  id: string;
  key: string;
  title: string;
  kind: TicketKind;
  status: TicketStatus;
  /**
   * How a Done ticket closed (CL-89, `contracts/tickets.py`): null or absent is done as planned,
   * `rejected` is a person's "won't do". Typed as the wire's `string`: new values can appear.
   */
  resolution?: string | null;
  /** Why; set exactly when `resolution` is. */
  resolutionReason?: string | null;
  priority: TicketPriority;
  position: number;
  version: number;
  assignee?: PrincipalRef | null;
  waitingOn?: PrincipalRef | null;
  labels?: LabelOut[];
  commentCount?: number;
  attachmentCount?: number;
  agentWorking?: boolean;
  stall?: StallSummary | null;
  waitingOnHuman?: boolean;
  milestone?: MilestoneRef | null;
  held?: boolean;
  blocked?: boolean;
  updatedAt: string;
  statusChangedAt: string;
  links?: LinkChip[];
}

export interface TicketSummary extends TicketCard {
  project: ProjectRef;
  createdAt: string;
  closedAt?: string | null;
}

export interface TicketsResponse {
  nextCursor?: string | null;
  tickets: TicketSummary[];
}

export interface ReleaseRef {
  id: string;
  number: number;
  version?: string | null;
  title: string;
  state: ReleaseState;
  deletedAt?: string | null;
}

export interface RelationRef {
  id: string;
  key: string;
  title: string;
  status: TicketStatus;
  active: boolean;
}

export interface RichBody {
  /**
   * The number 1 on the wire (`contracts/richtext.py`, `v: Literal[1]`). read-model.md prints it as
   * `"1"` because its doc tool quotes every literal; the validator accepts that string too.
   */
  v?: 1 | "1";
  profile?: "ticket";
  doc: Record<string, unknown>;
}

/** The full ticket (`GET /api/tickets/{ref}`). `links` there are `LinkOut`, loosely typed here. */
export interface Ticket extends Omit<TicketSummary, "links"> {
  archivedAt?: string | null;
  release?: ReleaseRef | null;
  stallDetail?: StallDetail | null;
  blockedBy?: RelationRef[];
  blocking?: RelationRef[];
  links?: unknown[];
  body?: RichBody | null;
  bodyMarkdown?: string | null;
  attachments?: unknown[];
  createdBy: PrincipalRef;
  seedId?: string | null;
}

export interface TicketResponse {
  ticket: Ticket;
}

/** The body of a system comment (`contracts/richtext.py`): no `doc`, the code and the lead it concerns. */
export interface SystemCommentBody {
  v?: 1 | "1";
  /** `code` is one of `SYSTEM_COMMENT_CODES` today; typed as the wire's `string`. */
  system: { code: string; lead: string; detail?: string | null };
}

export interface CommentOut {
  id: string;
  ticketId: string;
  parentId?: string | null;
  rootId: string;
  author: PrincipalRef;
  kind: CommentKind;
  systemCode?: SystemCommentCode | null;
  deliveryId?: string | null;
  /** Null for a deleted comment; a system comment carries a `SystemCommentBody`. */
  body?: RichBody | SystemCommentBody | null;
  bodyMarkdown?: string | null;
  attachments?: unknown[];
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
}

export interface CommentsResponse {
  nextCursor?: string | null;
  comments: CommentOut[];
}

export interface ProgressItem {
  id: number;
  agent: PrincipalRef;
  kind: ProgressKind;
  text: string;
  worker?: string | null;
  source: ProgressSource;
  createdAt: string;
}

export interface ProgressResponse {
  nextCursor?: string | null;
  progress: ProgressItem[];
}

// Board

export interface BoardColumn {
  status: TicketStatus;
  tickets: TicketCard[];
}

export interface BoardResponse {
  columns: BoardColumn[];
}

// Milestones and releases

export interface MilestoneSummary {
  id: string;
  key: string;
  number: number;
  title: string;
  state: MilestoneState;
  project: ProjectRef;
  targetDate?: string | null;
  position: number;
  owner?: PrincipalRef | null;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  archivedAt?: string | null;
  revision: number;
}

export interface MilestonesResponse {
  nextCursor?: string | null;
  milestones: MilestoneSummary[];
}

export interface ReleaseAppNote {
  state: ReleaseAppNoteState;
  url?: string | null;
  reason?: string | null;
}

export interface ReleaseSummary {
  id: string;
  number: number;
  version?: string | null;
  title: string;
  state: ReleaseState;
  deletedAt?: string | null;
  project: ProjectRef;
  ticketCount: number;
  createdAt: string;
  publishedAt?: string | null;
  githubTagUrl?: string | null;
  tagSha?: string | null;
  appNote: ReleaseAppNote;
}

export interface ReleasesResponse {
  nextCursor?: string | null;
  releases: ReleaseSummary[];
}

// Team

export interface TeamAgent {
  name: string;
  /** One of `LANE_STATUSES` today; typed as the wire's `string`. */
  status: string;
  paneId?: string | null;
  workspaceId?: string | null;
  contextLine?: string | null;
  lead?: string | null;
  unsentInput?: "typed" | "unknown" | null;
}

export interface TeamSession {
  name: string;
  agents: TeamAgent[];
}

export interface TeamSnapshot {
  /**
   * The number 1 on the wire (`contracts/team.py`, `v: Literal[1]`). read-model.md prints `v?: "1"`
   * (its doc tool quotes every literal); the string is accepted too.
   */
  v?: 1 | "1";
  /** The probe's clock; `""` until the first upload. */
  ts: string;
  sessions: TeamSession[];
}

// Deliveries, DMs, watchdog

export interface DeliveryOut {
  id: string;
  eventSeq: number;
  recipientId: string;
  ticketId: string | null;
  dmMessageId?: string | null;
  commentId?: string | null;
  reason: DeliveryReason;
  state: DeliveryState;
  attempts: number;
  attemptId?: string | null;
  attemptedSession?: string | null;
  leaseUntil?: string | null;
  nextAttemptAt?: string | null;
  lastError?: string | null;
  seenAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DmThread {
  id: string;
  agentId: string;
  createdAt: string;
  lastMessageAt: string;
  unreadCount: number;
}

export interface DmThreadsResponse {
  threads: DmThread[];
}

export interface DmMessage {
  id: string;
  threadId: string;
  author: PrincipalRef;
  body: RichBody;
  bodyMarkdown: string;
  bodyText: string;
  replyTo: string | null;
  clientId: string;
  createdAt: string;
  deliveryId: string | null;
  deliveryState: DeliveryState | null;
  deliveryError: string | null;
  answeredAt: string | null;
  state: DmMessageState;
}

export interface DmMessagesResponse {
  messages: DmMessage[];
  nextCursor: string | null;
}

export interface WatchdogTransport {
  oldestPendingDeliveryS?: number | null;
  unsentNotifications?: number;
  inputObstructed?: number;
}

export interface WatchdogItem {
  ticket: TicketSummary;
  stall: StallDetail;
}

export interface WatchdogResponse {
  mode: WatchdogMode;
  lastTickAt?: string | null;
  stopped?: boolean;
  lastError?: string | null;
  monitoring?: string;
  transport?: WatchdogTransport;
  openStalled?: number;
  openAttention?: number;
  open?: WatchdogItem[];
}

// Agents and principals (read-model.md endpoint table; no schema block)

/** The projects an agent leads and the ones it is a member of (`contracts/agents.py`, `AgentProjects`). */
export interface AgentProjects {
  lead: ProjectRef[];
  member: ProjectRef[];
}

/**
 * An item of `GET /api/agents` (`contracts/agents.py`, `AgentDetailOut`). read-model.md names the
 * keys but has no schema block; the shapes are read from the loops code. `lane` and `rights` are
 * not read by the world.
 */
export interface AgentOut {
  id: string;
  displayName: string;
  role: string;
  herdrSession: string | null;
  disabled: boolean;
  lastSeenAt: string | null;
  keys: unknown[] | null;
  isCrewhubLead: boolean;
  isCoordinator?: boolean;
  isOperator?: boolean;
  isLauncher?: boolean;
  isBuilderReader?: boolean;
  successorId?: string | null;
  projects: AgentProjects;
  lane?: unknown;
  rights?: unknown;
  revision?: number;
}

export interface AgentsResponse {
  agents: AgentOut[];
}

export interface PrincipalOut {
  id: string;
  kind: PrincipalKind;
  displayName: string;
}

export interface PrincipalsResponse {
  principals: PrincipalOut[];
}

// Events (events.md)

export interface EventProjectRef {
  slug: string;
  key: string;
}

export interface EventTicketRef {
  id: string;
  key: string;
  title: string;
}

export interface ActorRef {
  id: string;
  kind: PrincipalKind;
}

/** One event as served by `GET /api/events` and the NDJSON stream. */
export interface Envelope {
  v: 1;
  seq: number;
  ts: string;
  type: string;
  project: EventProjectRef | null;
  ticket: EventTicketRef | null;
  actor: ActorRef;
  recipientIds: string[];
  payload: Record<string, unknown>;
}

/** The event types the world handles; every other type is skipped, never an error (stability.md). */
export const WORLD_EVENT_TYPES = [
  "ticket.created",
  "ticket.updated",
  "ticket.moved",
  "ticket.archived",
  "ticket.unarchived",
  "ticket.progress",
  "ticket.stalled",
  "ticket.resumed",
  "comment.created",
  "comment.updated",
  "comment.deleted",
  "delivery.created",
  "delivery.updated",
  "dm.created",
  "dm.answered",
  "team.updated",
  "project.created",
  "project.updated",
  "project.archived",
  "project.restored",
  "project.reordered",
  "milestone.created",
  "milestone.updated",
  "milestone.completed",
  "milestone.cancelled",
  "milestone.archived",
  "milestone.restored",
  "milestone.tickets_attached",
  "milestone.tickets_detached",
  "milestone.handoff",
  "milestone.handoff_withdrawn",
  "release.created",
  "release.updated",
  "release.published",
  "release.deleted",
] as const;
export type WorldEventType = (typeof WORLD_EVENT_TYPES)[number];

export function isWorldEventType(type: string): type is WorldEventType {
  return (WORLD_EVENT_TYPES as readonly string[]).includes(type);
}

// Payloads. Unknown extra keys are allowed by the validators and not typed here.
// `reason`, `state` and `resolution` are `string` where stability.md says new values can appear.

export interface TicketCreatedPayload {
  kind: TicketKind;
  status: TicketStatus;
  assigneeId: string | null;
}

/** All `ticket.updated` shapes ("ticket.updated payloads"): `changed` is always there. */
export interface TicketUpdatedPayload {
  changed: string[];
  newMentions?: unknown;
  milestone?: unknown;
  reason?: string;
  relation?: unknown;
  unblockedBy?: unknown;
  how?: string;
  code?: string;
}

export interface TicketMovedPayload {
  from: TicketStatus;
  to: TicketStatus;
  position: number;
  renumbered?: unknown;
  waitingOnCleared?: boolean;
  /**
   * Only when this move sets it (`domain/board.py`, the `ticket.moved` emit): a person closed the
   * ticket as rejected. A rejection of a ticket that is already Done has `from == to == "done"`.
   */
  resolution?: string | null;
  resolutionReason?: string | null;
  /** The ticket had a resolution and this move took it away (a reopen, or a plain Done after all). */
  resolutionCleared?: boolean;
  /** The names of the labels this move removed, `["awaiting-deploy"]` today (`domain/board.py`). */
  labelsCleared?: string[];
  reason?: string;
  code?: string;
  milestoneId?: string;
  handoffId?: string;
}

export interface TicketArchivedPayload {
  batchId: string | null;
  batchSize: number | null;
  releaseId: string | null;
  reason: string;
}

export interface TicketUnarchivedPayload {
  batchId: string | null;
  releaseId: string | null;
}

export interface TicketProgressPayload {
  /** The ticket key. */
  ticket: string;
  agent: string;
  kind: ProgressKind;
  /** A worker line reads `"<worker>: <line>"`. */
  text: string;
}

export interface TicketStalledPayload {
  ticket: string;
  agent: string;
  episode: unknown;
  reason: string;
  quietSince: string;
  quietMinutes: number;
  members: { name: string; status: string }[];
  nudge: unknown;
}

export interface TicketResumedPayload {
  ticket: string;
  agent: string;
  episode: unknown;
  resolution: string;
  minutes: number;
  deliveryId?: string;
}

export interface CommentPayload {
  commentId: string;
  parentId: string | null;
}

export interface DeliveryCreatedPayload {
  deliveryId: string;
  recipientId: string;
  reason: string;
  dmThreadId?: string;
}

export interface DeliveryUpdatedPayload {
  deliveryId: string;
  state: string;
  dmThreadId?: string;
}

export interface DmPayload {
  threadId: string;
  messageId: string;
  agentId: string;
}

export type TeamUpdatedPayload = Record<string, never>;

export interface ProjectChangePayload {
  changed: string[];
  old: unknown;
  new: unknown;
}

export interface ProjectCreatedPayload extends ProjectChangePayload {
  slug: string;
  key: string;
  leadId: string;
}

export interface ProjectReorderedPayload {
  slugs: string[];
}

export interface MilestonePayload {
  milestoneId: string;
  key: string;
  title: string;
}

export interface MilestoneUpdatedPayload extends MilestonePayload {
  changed: string[];
  old: unknown;
  new: unknown;
}

export interface MilestoneTicketsAttachedPayload extends MilestonePayload {
  ticketIds: string[];
}

export interface MilestoneTicketsDetachedPayload extends MilestonePayload {
  ticketIds: string[];
  reason: string;
}

export interface MilestoneHandoffPayload extends MilestonePayload {
  handoffId: string;
  count: number;
  recipientId: string;
}

export interface ReleaseCreatedPayload {
  releaseId: string;
  number: number;
  count: number;
}

export interface ReleaseUpdatedPayload {
  releaseId: string;
  revision: number;
  changed: string[];
  code?: string;
}

export interface ReleasePublishedPayload {
  releaseId: string;
  revision: number;
  version: string | null;
}

export interface ReleaseDeletedPayload {
  releaseId: string;
  tombstone: boolean;
}

export interface WorldEventPayloads {
  "ticket.created": TicketCreatedPayload;
  "ticket.updated": TicketUpdatedPayload;
  "ticket.moved": TicketMovedPayload;
  "ticket.archived": TicketArchivedPayload;
  "ticket.unarchived": TicketUnarchivedPayload;
  "ticket.progress": TicketProgressPayload;
  "ticket.stalled": TicketStalledPayload;
  "ticket.resumed": TicketResumedPayload;
  "comment.created": CommentPayload;
  "comment.updated": CommentPayload;
  "comment.deleted": CommentPayload;
  "delivery.created": DeliveryCreatedPayload;
  "delivery.updated": DeliveryUpdatedPayload;
  "dm.created": DmPayload;
  "dm.answered": DmPayload;
  "team.updated": TeamUpdatedPayload;
  "project.created": ProjectCreatedPayload;
  "project.updated": ProjectChangePayload;
  "project.archived": ProjectChangePayload;
  "project.restored": ProjectChangePayload;
  "project.reordered": ProjectReorderedPayload;
  "milestone.created": MilestonePayload;
  "milestone.updated": MilestoneUpdatedPayload;
  "milestone.completed": MilestonePayload;
  "milestone.cancelled": MilestonePayload;
  "milestone.archived": MilestonePayload;
  "milestone.restored": MilestonePayload;
  "milestone.tickets_attached": MilestoneTicketsAttachedPayload;
  "milestone.tickets_detached": MilestoneTicketsDetachedPayload;
  "milestone.handoff": MilestoneHandoffPayload;
  "milestone.handoff_withdrawn": MilestoneHandoffPayload;
  "release.created": ReleaseCreatedPayload;
  "release.updated": ReleaseUpdatedPayload;
  "release.published": ReleasePublishedPayload;
  "release.deleted": ReleaseDeletedPayload;
}

/** An envelope whose type is on the allowlist, with its payload typed. */
export type WorldEvent = {
  [T in WorldEventType]: Omit<Envelope, "type" | "payload"> & { type: T; payload: WorldEventPayloads[T] };
}[WorldEventType];

/** The stream's heartbeat line: not an event. */
export interface Heartbeat {
  v: 1;
  type: "heartbeat";
  seq: number;
  ts: string;
}

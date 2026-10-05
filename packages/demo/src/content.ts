/**
 * The demo installation: who exists, which projects, which tickets, as crewhub-loops would hold
 * them at the start of every loop. All of it is fiction and every surface labels it as demo.
 * Times are offsets from the loop's base instant, so each loop starts from the same picture.
 * See CONTENT.md for the reasoning and the storyline.
 */
import type {
  LabelOut,
  MilestoneState,
  ProgressKind,
  ProjectColor,
  ProjectIcon,
  TicketKind,
  TicketPriority,
  TicketStatus,
} from "@crewhub/loops-client";
import { DAY, HOUR, MINUTE } from "./time.ts";

/** The herdr session every demo lane runs in. */
export const DEMO_SESSION = "ekinsol";
/** The last seq of the demo log before loop 0 starts. */
export const DEMO_BASE_CURSOR = 4700;
/** Seqs of reset k (loop or seek) start at DEMO_BASE_CURSOR + k * DEMO_SEQ_STRIDE. */
export const DEMO_SEQ_STRIDE = 100_000;

export interface PersonSeed {
  id: string;
  displayName: string;
  role: "admin" | "member";
}

export interface AgentSeed {
  id: string;
  displayName: string;
  role: "lead" | "router" | "probe";
  isCrewhubLead: boolean;
  /** The projects the agent is a member of without leading them (`AgentOut.projects.member`), as slugs. */
  memberOf: string[];
}

export const PEOPLE: PersonSeed[] = [
  { id: "nicky", displayName: "Nicky", role: "admin" },
  { id: "sam", displayName: "Sam", role: "member" },
];

export const AGENTS: AgentSeed[] = [
  { id: "g-man", displayName: "G-Man", role: "lead", isCrewhubLead: true, memberOf: [] },
  { id: "cr-lead", displayName: "CR Lead", role: "lead", isCrewhubLead: false, memberOf: [] },
  {
    id: "cl-lead",
    displayName: "CL Lead",
    role: "lead",
    isCrewhubLead: false,
    memberOf: [],
  },
  { id: "marky", displayName: "Marky", role: "lead", isCrewhubLead: false, memberOf: [] },
  {
    id: "analyst",
    displayName: "Analyst",
    role: "lead",
    isCrewhubLead: false,
    memberOf: ["crewhub-loops", "marketing"],
  },
  { id: "ux-lead", displayName: "UX Lead", role: "lead", isCrewhubLead: false, memberOf: ["marketing"] },
  { id: "postman", displayName: "Postman", role: "router", isCrewhubLead: false, memberOf: [] },
  { id: "team-probe", displayName: "Team probe", role: "probe", isCrewhubLead: false, memberOf: [] },
];

export interface ProjectSeed {
  id: string;
  slug: string;
  key: string;
  name: string;
  color: ProjectColor;
  icon: ProjectIcon;
  leadId: string;
  description: string;
  features: { milestones: boolean; releases: boolean; watchdog_nudge: boolean };
  /** Archived at the loop start this long before the base instant; null when active. */
  archivedAgo: number | null;
  /**
   * FUTURE (proposal L22 "project groups", not in crewhub-loops today): the id of the group above this project.
   * Only the Studio scenario and the `?stress=20` fixture set it; it leaves the source as `ProjectOut.groupId`.
   */
  groupId?: string;
}

/**
 * FUTURE (proposal L22, not in crewhub-loops today): a level above projects, in the shape the world would like
 * loops to offer (`ProjectGroup` of `@crewhub/loops-client`): `GET /api/project-groups` would answer
 * `{ groups: ProjectGroup[] }`. Loops carries no looks; a zone's look lives in the town document.
 */
export interface ProjectGroupSeed {
  id: string;
  slug: string;
  name: string;
  order: number;
  color: ProjectColor | null;
  icon: ProjectIcon | null;
}

/** In sidebar order; the archived one is appended when it is restored. */
export const PROJECTS: ProjectSeed[] = [
  {
    id: "pr_demo00000001",
    slug: "crewhub",
    key: "CR",
    name: "CrewHub World",
    color: "coral",
    icon: "home",
    leadId: "cr-lead",
    description: "A 3D town that mirrors crewhub-loops: a building per project, work as objects.",
    features: { milestones: true, releases: true, watchdog_nudge: true },
    archivedAgo: null,
  },
  {
    id: "pr_demo00000002",
    slug: "crewhub-loops",
    key: "CL",
    name: "crewhub-loops",
    color: "circle",
    icon: "inbox",
    leadId: "cl-lead",
    description: "The ticketing API, the event log and the lanes that work on it.",
    features: { milestones: true, releases: true, watchdog_nudge: false },
    archivedAgo: null,
  },
  {
    id: "pr_demo00000003",
    slug: "marketing",
    key: "MK",
    name: "Launch & Marketing",
    color: "tangerine",
    icon: "spark",
    leadId: "marky",
    description: "Launch week for CrewHub World: copy, video, press.",
    features: { milestones: true, releases: false, watchdog_nudge: false },
    archivedAgo: null,
  },
  {
    id: "pr_demo00000004",
    slug: "ops-tooling",
    key: "OPS",
    name: "Ops & Tooling",
    color: "ink",
    icon: "bot",
    leadId: "cl-lead",
    description: "Probe, backups and CI for the team machines.",
    features: { milestones: false, releases: false, watchdog_nudge: false },
    archivedAgo: 12 * DAY,
  },
];

/** The description OPS gets from `project.updated` in the script. */
export const OPS_NEW_DESCRIPTION =
  "Probe, backups and CI for the team machines. Back in use for the key rotation.";

export const LABELS: LabelOut[] = [
  { id: "lb_awaiting_deploy", projectId: null, name: "awaiting-deploy", color: "tangerine", revision: 1 },
  { id: "lb_release", projectId: null, name: "release", color: "coral", revision: 1 },
  { id: "lb_prop", projectId: "pr_demo00000001", name: "prop", color: "circle", revision: 1 },
  { id: "lb_renderer", projectId: "pr_demo00000001", name: "renderer", color: "mist", revision: 1 },
  { id: "lb_pathfinding", projectId: "pr_demo00000001", name: "pathfinding", color: "ink", revision: 1 },
  { id: "lb_api", projectId: "pr_demo00000002", name: "api", color: "ink", revision: 1 },
  { id: "lb_docs", projectId: "pr_demo00000002", name: "docs", color: "mist", revision: 1 },
  { id: "lb_copy", projectId: "pr_demo00000003", name: "copy", color: "tangerine", revision: 1 },
  { id: "lb_launch", projectId: "pr_demo00000003", name: "launch", color: "coral", revision: 1 },
  { id: "lb_ci", projectId: "pr_demo00000004", name: "ci", color: "ink", revision: 1 },
];

export interface MilestoneSeed {
  id: string;
  project: string;
  number: number;
  title: string;
  state: MilestoneState;
  targetDate: string | null;
  ownerId: string | null;
}

export const MILESTONES: MilestoneSeed[] = [
  {
    id: "ms_demo_cr_2",
    project: "crewhub",
    number: 2,
    title: "Walkable town",
    state: "active",
    targetDate: "2026-10-09",
    ownerId: "cr-lead",
  },
  {
    id: "ms_demo_cl_3",
    project: "crewhub-loops",
    number: 3,
    title: "Integrator docs",
    state: "active",
    targetDate: "2026-10-03",
    ownerId: "cl-lead",
  },
  {
    id: "ms_demo_mk_1",
    project: "marketing",
    number: 1,
    title: "Launch week",
    state: "planned",
    targetDate: "2026-10-15",
    ownerId: "marky",
  },
];

export interface ReleaseSeed {
  id: string;
  project: string;
  number: number;
  version: string | null;
  title: string;
  /** Carrier ticket key. */
  carrier: string;
  requestedLeadId: string;
}

export const RELEASES: ReleaseSeed[] = [
  {
    id: "rl_demo_cr_3",
    project: "crewhub",
    number: 3,
    version: "0.3.0",
    title: "Town skeleton",
    carrier: "CR-19",
    requestedLeadId: "cr-lead",
  },
];

/** Next free release number per project (CL's release 5 is created by the script). */
export const NEXT_RELEASE_NUMBER: Record<string, number> = { crewhub: 4, "crewhub-loops": 5 };

export interface TicketSeed {
  key: string;
  title: string;
  kind: TicketKind;
  priority: TicketPriority;
  status: TicketStatus;
  assignee?: string;
  waitingOn?: string;
  labels?: string[];
  /** Milestone key, e.g. "CR-M2". */
  milestone?: string;
  held?: boolean;
  /** Keys of the tickets that block this one. */
  blockedBy?: string[];
  /** Done tickets: closed this long before the base. */
  closedAgo?: number;
  /** Archived into this release id (a release draft's member). */
  archivedInto?: string;
  /** The carrier of this release id. */
  carrierOf?: string;
  createdBy?: string;
  /** Created this long before the base; derived from the number when absent. */
  createdAgo?: number;
  body: string;
}

export const TICKETS: TicketSeed[] = [
  // CrewHub World (CR)
  ...[
    ["CR-8", "Town ground plane and plot grid"],
    ["CR-9", "Building shell from the project colour and icon"],
    ["CR-10", "Lead's office at the building centre"],
    ["CR-11", "Status counts on the building sign"],
  ].map(
    ([key, title], index): TicketSeed => ({
      key: key ?? "",
      title: title ?? "",
      kind: "feature",
      priority: "normal",
      status: "done",
      assignee: "cr-lead",
      closedAgo: (6 - index) * DAY,
      archivedInto: "rl_demo_cr_3",
      body: "Part of the town skeleton.",
    }),
  ),
  {
    key: "CR-14",
    title: "Demo badge on every surface",
    kind: "task",
    priority: "high",
    status: "done",
    assignee: "cr-lead",
    closedAgo: 2 * DAY,
    body: "Nothing may imply a real running session: label every demo surface.",
  },
  {
    key: "CR-15",
    title: "Hidden text view lists every scene fact",
    kind: "feature",
    priority: "normal",
    status: "done",
    assignee: "cr-lead",
    closedAgo: 1 * DAY,
    body: "Every fact the scene shows has a line in the text view.",
  },
  {
    key: "CR-16",
    title: "Enter and leave a building with the keyboard",
    kind: "feature",
    priority: "normal",
    status: "done",
    assignee: "cr-lead",
    closedAgo: 5 * DAY,
    body: "Enter opens the focused building, Escape goes back to the town.",
  },
  {
    key: "CR-17",
    title: "Building sign reads name and key from ProjectOut",
    kind: "feature",
    priority: "normal",
    status: "review",
    assignee: "cr-lead",
    waitingOn: "nicky",
    body: "The sign shows `name` and `key`; the key refreshes on project.updated.",
  },
  {
    key: "CR-18",
    title: "Keyboard navigation between town and buildings",
    kind: "feature",
    priority: "high",
    status: "review",
    assignee: "cr-lead",
    waitingOn: "nicky",
    milestone: "CR-M2",
    body: "Arrow keys move between plots; Tab reaches the rooms inside.",
  },
  {
    key: "CR-20",
    title: "Bug: camera jumps when leaving a building",
    kind: "bug",
    priority: "urgent",
    status: "review",
    assignee: "cr-lead",
    body: "The orthographic camera snaps to the origin for one frame on Escape.",
  },
  {
    key: "CR-19",
    title: "Release 3 (0.3.0): Town skeleton",
    kind: "task",
    priority: "normal",
    status: "in_progress",
    assignee: "cr-lead",
    labels: ["release"],
    carrierOf: "rl_demo_cr_3",
    createdBy: "nicky",
    createdAgo: 20 * HOUR,
    body: "Release carrier: notes, version, tag, publish.",
  },
  {
    key: "CR-21",
    title: "Local A* per room with a binary heap",
    kind: "feature",
    priority: "high",
    status: "in_progress",
    assignee: "cr-lead",
    labels: ["pathfinding"],
    milestone: "CR-M2",
    body: "One leg at a time inside a room; the portal graph plans between rooms.",
  },
  {
    key: "CR-22",
    title: "Instanced pallets for large Done piles",
    kind: "task",
    priority: "normal",
    status: "in_progress",
    assignee: "cr-lead",
    labels: ["renderer"],
    body: "Piles above twelve objects become one pallet with a count, drawn instanced.",
  },
  {
    key: "CR-23",
    title: "Freshness label when the team snapshot is old",
    kind: "task",
    priority: "high",
    status: "in_progress",
    assignee: "cr-lead",
    waitingOn: "nicky",
    body: "Greyed agents and a label when the snapshot is older than five minutes. Wording?",
  },
  {
    key: "CR-24",
    title: "Design pass on the lobby mailbox",
    kind: "task",
    priority: "normal",
    status: "in_progress",
    assignee: "cr-lead",
    body: "Letters, a flag for uncertain and unroutable ones, readable from the overview.",
  },
  {
    key: "CR-25",
    title: "Question: should proxies show a ticket count?",
    kind: "question",
    priority: "normal",
    status: "planned",
    body: "A translucent proxy could show how many tickets wait in its building.",
  },
  {
    key: "CR-27",
    title: "Portal graph: doors between rooms",
    kind: "feature",
    priority: "high",
    status: "planned",
    assignee: "cr-lead",
    labels: ["pathfinding"],
    milestone: "CR-M2",
    body: "Doors are single-occupancy portals with a wait budget.",
  },
  {
    key: "CR-28",
    title: "Postman walk between buildings",
    kind: "feature",
    priority: "normal",
    status: "planned",
    assignee: "cr-lead",
    milestone: "CR-M2",
    blockedBy: ["CR-21"],
    body: "The postman carries a letter from the post office to the recipient's lobby.",
  },
  {
    key: "CR-30",
    title: "Night lighting for building interiors",
    kind: "feature",
    priority: "low",
    status: "backlog",
    labels: ["renderer"],
    milestone: "CR-M2",
    body: "Warm lamps after dusk, following the Greenhouse lighting.",
  },
  {
    key: "CR-31",
    title: "Weather: light rain over the town square",
    kind: "feature",
    priority: "low",
    status: "backlog",
    body: "Cosmetic only; off with reduced motion.",
  },
  {
    key: "CR-33",
    title: "Bug: pallet count overlaps the Dispatch door",
    kind: "bug",
    priority: "normal",
    status: "backlog",
    labels: ["renderer"],
    body: "At 52 Done tickets the count label covers the door frame.",
  },
  {
    key: "CR-35",
    title: "Prop: a tall fern for the lobby",
    kind: "task",
    priority: "normal",
    status: "backlog",
    labels: ["prop"],
    createdBy: "sam",
    body: "A tall potted fern next to the lobby mailbox. Place it in the lobby.",
  },

  // crewhub-loops (CL)
  ...[
    ["CL-70", "Heartbeat line on the NDJSON stream"],
    ["CL-71", "Bug: stream drops a reader that stalls for 10 s"],
    ["CL-72", "Four open streams per principal"],
  ].map(
    ([key, title], index): TicketSeed => ({
      key: key ?? "",
      title: title ?? "",
      kind: index === 1 ? "bug" : "feature",
      priority: "normal",
      status: "done",
      assignee: "cl-lead",
      labels: ["api"],
      closedAgo: (4 - index) * DAY,
      body: "Stream work for the next release.",
    }),
  ),
  {
    key: "CL-73",
    title: "Document the resume recipe in events.md",
    kind: "task",
    priority: "high",
    status: "done",
    assignee: "cl-lead",
    labels: ["docs"],
    milestone: "CL-M3",
    closedAgo: 1 * DAY,
    body: "Tail first, then the snapshot, then the stream with after.",
  },
  {
    key: "CL-74",
    title: "Pin lane statuses to the code",
    kind: "task",
    priority: "normal",
    status: "done",
    assignee: "cl-lead",
    labels: ["docs"],
    milestone: "CL-M3",
    closedAgo: 2 * DAY,
    body: "A test compares the table in agents-and-states.md with the code.",
  },
  {
    key: "CL-76",
    title: "Heartbeat seq is never ahead of the last envelope",
    kind: "bug",
    priority: "high",
    status: "review",
    assignee: "cl-lead",
    labels: ["api"],
    body: "Storing a heartbeat's seq as the cursor must never skip an event.",
  },
  {
    key: "CL-80",
    title: "read-model.md: loading a snapshot, step by step",
    kind: "task",
    priority: "normal",
    status: "review",
    assignee: "cl-lead",
    waitingOn: "nicky",
    labels: ["docs"],
    milestone: "CL-M3",
    body: "Seven steps from the tail to the open stream.",
  },
  {
    key: "CL-81",
    title: "events.md: the complete catalogue",
    kind: "task",
    priority: "high",
    status: "in_progress",
    assignee: "cl-lead",
    labels: ["docs"],
    milestone: "CL-M3",
    body: "Every type the code can write, with filter, actors, payload and recipients.",
  },
  {
    key: "CL-40",
    title: "Map event types to world reactions",
    kind: "task",
    priority: "normal",
    status: "in_progress",
    assignee: "analyst",
    labels: ["api"],
    body: "Which event moves which object; which ones the world skips.",
  },
  {
    key: "CL-44",
    title: "Tail endpoint for the event log",
    kind: "feature",
    priority: "high",
    status: "in_progress",
    assignee: "cl-lead",
    labels: ["api"],
    body: "GET /api/events/tail instead of the attachment.added trick.",
  },
  {
    key: "CL-45",
    title: "Stream: 410 cursor_expired after retention",
    kind: "feature",
    priority: "normal",
    status: "in_progress",
    assignee: "cl-lead",
    labels: ["api", "awaiting-deploy"],
    body: "Once retention exists, an old cursor answers 410 and the client reloads.",
  },
  {
    key: "CL-82",
    title: "Viewer role for read-only keys",
    kind: "feature",
    priority: "high",
    status: "planned",
    assignee: "cl-lead",
    body: "A key that can read everything and write nothing, for the world host.",
  },
  {
    key: "CL-83",
    title: "Question: publish JSON Schemas for event payloads?",
    kind: "question",
    priority: "normal",
    status: "planned",
    body: "Clients hand-write validators today.",
  },
  {
    key: "CL-84",
    title: "Project-scoped event stream key",
    kind: "feature",
    priority: "normal",
    status: "backlog",
    body: "A key that only sees one project's events.",
  },
  {
    key: "CL-85",
    title: "Bug: types=agent.created answers 400",
    kind: "bug",
    priority: "low",
    status: "backlog",
    labels: ["api"],
    body: "Emitted types missing from the filter list.",
  },
  {
    key: "CL-86",
    title: "receivedAt on GET /api/team",
    kind: "feature",
    priority: "normal",
    status: "backlog",
    body: "Clients cannot tell how old the snapshot is by the server's clock.",
  },
  {
    key: "CL-87",
    title: "Avatar field on principals",
    kind: "feature",
    priority: "low",
    status: "backlog",
    body: "The web app draws initials; other clients bring their own mapping.",
  },

  // Launch & Marketing (MK)
  ...[
    ["MK-3", "Launch post outline"],
    ["MK-4", "Pick the demo projects for the launch video"],
    ["MK-5", "Press kit: logo lockups"],
  ].map(
    ([key, title], index): TicketSeed => ({
      key: key ?? "",
      title: title ?? "",
      kind: "task",
      priority: "normal",
      status: "done",
      assignee: "marky",
      closedAgo: (3 + index) * DAY,
      body: "Launch preparation.",
    }),
  ),
  {
    key: "MK-7",
    title: "Landing page copy, first pass",
    kind: "task",
    priority: "normal",
    status: "review",
    assignee: "marky",
    waitingOn: "nicky",
    labels: ["copy"],
    body: "Headline, three benefits, one screenshot.",
  },
  {
    key: "MK-9",
    title: "Landing page hero illustration",
    kind: "feature",
    priority: "normal",
    status: "in_progress",
    assignee: "ux-lead",
    labels: ["launch"],
    body: "The town at golden hour, in the Greenhouse style.",
  },
  {
    key: "MK-10",
    title: "Screenshot tour of the town",
    kind: "task",
    priority: "normal",
    status: "in_progress",
    assignee: "marky",
    labels: ["launch"],
    body: "Six screenshots, desktop and phone, light and dark.",
  },
  {
    key: "MK-12",
    title: "Launch metrics: what we count and why",
    kind: "task",
    priority: "high",
    status: "in_progress",
    assignee: "analyst",
    body: "Only numbers we can explain; no vanity counters.",
  },
  {
    key: "MK-11",
    title: "Newsletter announcement draft",
    kind: "task",
    priority: "normal",
    status: "planned",
    assignee: "marky",
    labels: ["copy"],
    body: "Short, with the demo video at the top.",
  },
  {
    key: "MK-13",
    title: "Launch week social thread",
    kind: "task",
    priority: "normal",
    status: "backlog",
    labels: ["launch"],
    milestone: "MK-M1",
    body: "Seven posts, one per day.",
  },
  {
    key: "MK-14",
    title: "Demo video voice-over script",
    kind: "feature",
    priority: "high",
    status: "backlog",
    milestone: "MK-M1",
    body: "Ninety seconds over the self-running demo.",
  },
  {
    key: "MK-15",
    title: "Press embargo email",
    kind: "task",
    priority: "urgent",
    status: "backlog",
    milestone: "MK-M1",
    held: true,
    body: "Prepared; released with the launch week hand-off.",
  },
  {
    key: "MK-16",
    title: "FAQ: is my data sent anywhere?",
    kind: "question",
    priority: "normal",
    status: "backlog",
    body: "Demo mode makes no network calls; say it plainly.",
  },
  {
    key: "MK-17",
    title: "Bug: OG image crops the town",
    kind: "bug",
    priority: "low",
    status: "backlog",
    body: "The social preview cuts off the post office.",
  },

  // Ops & Tooling (OPS, archived at the start)
  {
    key: "OPS-2",
    title: "Move the probe to a launchd job",
    kind: "task",
    priority: "normal",
    status: "done",
    assignee: "cl-lead",
    closedAgo: 14 * DAY,
    body: "The probe survives a reboot.",
  },
  {
    key: "OPS-4",
    title: "Rotate the probe's agent key",
    kind: "task",
    priority: "high",
    status: "planned",
    assignee: "cl-lead",
    body: "New key, old key revoked, probe restarted.",
  },
  {
    key: "OPS-5",
    title: "CI: run the integrator doc tests on every PR",
    kind: "task",
    priority: "normal",
    status: "backlog",
    labels: ["ci"],
    body: "The doc drift tests fail fast.",
  },
  {
    key: "OPS-6",
    title: "Nightly backup check",
    kind: "task",
    priority: "low",
    status: "backlog",
    body: "Restore last night's copy into a scratch database and count rows.",
  },
];

/** Next free ticket number per project key. */
export const NEXT_TICKET_NUMBER: Record<string, number> = { CR: 37, CL: 88, MK: 18, OPS: 7 };

export interface LaneSeed {
  name: string;
  status: string;
  contextLine: string | null;
  /** The herdr workspace of the lane; "w1" when absent. */
  workspace?: string;
}

/** Lanes in the one herdr session at the loop start (the first snapshot is uploaded 12 s before). */
export const LANES: LaneSeed[] = [
  { name: "g-man", status: "idle", contextLine: null },
  { name: "cr-lead", status: "working", contextLine: "CR-21: reviewing the heap from cr-dev-1" },
  { name: "cr-dev-1", status: "working", contextLine: "CR-21: neighbour expansion with diagonal costs" },
  { name: "cr-dev-2", status: "working", contextLine: "CR-22: instancing pallets" },
  { name: "cr-design-1", status: "idle", contextLine: null },
  { name: "cr-scout", status: "idle", contextLine: "looked through the v1 demo for ideas" },
  { name: "cl-lead", status: "working", contextLine: "CL-81: catalogue table, releases section", workspace: "w2" },
  { name: "cl-dev-1", status: "working", contextLine: "CL-81: payload columns", workspace: "w2" },
  { name: "cl-dev-2", status: "working", contextLine: "CL-44: tail endpoint handler", workspace: "w2" },
  { name: "cl-analyst-1", status: "idle", contextLine: null, workspace: "w2" },
  { name: "marky", status: "working", contextLine: "MK-10: screenshots of the town overview" },
  { name: "analyst", status: "working", contextLine: "CL-40: mapping ticket events", workspace: "w2" },
  { name: "ux-lead", status: "working", contextLine: "MK-9: hero sketch" },
  { name: "postman", status: "idle", contextLine: null },
];

export interface CommentSeed {
  ticket: string;
  author: string;
  ago: number;
  text: string;
}

export const COMMENTS: CommentSeed[] = [
  { ticket: "CR-21", author: "cr-lead", ago: 3 * HOUR, text: "Heap in place; diagonal moves cost 1.4." },
  { ticket: "CR-23", author: "cr-lead", ago: 40 * MINUTE, text: "Wording: \"stale since 09:12\" or \"last seen 09:12\"?" },
  { ticket: "CR-17", author: "cr-lead", ago: 2 * HOUR, text: "Ready for review: the sign follows project.updated." },
  { ticket: "CL-80", author: "cl-lead", ago: 90 * MINUTE, text: "Seven steps, each with the endpoint to call." },
  { ticket: "MK-7", author: "marky", ago: 3 * HOUR, text: "First pass is up; the headline has two options." },
];

export interface ProgressSeed {
  ticket: string;
  agent: string;
  kind: ProgressKind;
  text: string;
  worker?: string;
  ago: number;
}

export const PROGRESS: ProgressSeed[] = [
  { ticket: "CR-21", agent: "cr-lead", kind: "start", text: "starting A* per room", ago: 4 * HOUR },
  { ticket: "CR-21", agent: "cr-lead", worker: "cr-dev-1", kind: "update", text: "heap push and pop pass", ago: 25 * MINUTE },
  { ticket: "CR-24", agent: "cr-lead", worker: "cr-design-1", kind: "update", text: "three mailbox sketches", ago: 35 * MINUTE },
  { ticket: "CL-81", agent: "cl-lead", kind: "update", text: "tickets and chat sections done", ago: 15 * MINUTE },
  { ticket: "CL-40", agent: "analyst", kind: "start", text: "listing the types the world reacts to", ago: HOUR },
  { ticket: "MK-12", agent: "analyst", kind: "update", text: "draft list of five launch numbers", ago: 2 * HOUR },
];

/** An earlier DM thread (yesterday), so the chat has history. */
export interface DmSeed {
  agent: string;
  author: string;
  ago: number;
  text: string;
}

export const DM_HISTORY: DmSeed[] = [
  { agent: "g-man", author: "nicky", ago: 18 * HOUR, text: "Can you keep an eye on the demo build tonight?" },
  { agent: "g-man", author: "g-man", ago: 18 * HOUR - 2 * MINUTE, text: "Yes. I'll post a summary in the morning." },
];

/**
 * One demo installation: everything crewhub-loops would hold at the start of a loop. A scenario (`scenarios.ts`)
 * is such an installation plus a storyline. Plain data, never mutated.
 */
export interface DemoContent {
  /** The herdr session every lane runs in. */
  session: string;
  people: PersonSeed[];
  agents: AgentSeed[];
  /** In sidebar order; archived ones are appended to the order when they are restored. */
  projects: ProjectSeed[];
  /** FUTURE (proposal L22): the groups above the projects. Empty in every scenario but Studio. */
  groups: ProjectGroupSeed[];
  labels: LabelOut[];
  milestones: MilestoneSeed[];
  releases: ReleaseSeed[];
  nextReleaseNumber: Record<string, number>;
  tickets: TicketSeed[];
  nextTicketNumber: Record<string, number>;
  lanes: LaneSeed[];
  comments: CommentSeed[];
  progress: ProgressSeed[];
  dmHistory: DmSeed[];
}

/** "Small team": the four projects of the original demo, the default scenario. */
export const SMALL_TEAM: DemoContent = {
  session: DEMO_SESSION,
  people: PEOPLE,
  agents: AGENTS,
  projects: PROJECTS,
  groups: [],
  labels: LABELS,
  milestones: MILESTONES,
  releases: RELEASES,
  nextReleaseNumber: NEXT_RELEASE_NUMBER,
  tickets: TICKETS,
  nextTicketNumber: NEXT_TICKET_NUMBER,
  lanes: LANES,
  comments: COMMENTS,
  progress: PROGRESS,
  dmHistory: DM_HISTORY,
};

/**
 * The seam between a source of crewhub-loops data and the world model. The demo (`packages/demo`)
 * implements it tonight; a future host source (`GET /world-api/snapshot` + SSE) implements it later.
 */
import type {
  AgentOut,
  BoardResponse,
  CommentOut,
  Envelope,
  MilestoneSummary,
  PrincipalOut,
  ProgressItem,
  ProjectGroup,
  ProjectOut,
  ReleaseSummary,
  TeamSnapshot,
  Ticket,
  WatchdogResponse,
} from "./types.ts";

/**
 * Playback of a scripted or recorded source (the demo timeline tonight, a replay later).
 * The world never needs it to render; the UI shows it when a source offers it.
 */
export type PlaybackSpeed = 0 | 1 | 4 | 16;
export interface PlaybackControls {
  readonly durationMs: number;
  positionMs(): number;
  speed(): PlaybackSpeed;
  setSpeed(speed: PlaybackSpeed): void;
  /** Seek to a point of the script; seeking back resets the world and replays to that point. */
  seek(positionMs: number): void;
  /** How many times the script has looped. */
  loop(): number;
  onChange(listener: () => void): () => void;
}

/** Everything a world needs at start, as the plan's host would load it (read-model.md "Loading a snapshot"). */
export interface LoopsSnapshot {
  /** Events with seq > cursor follow this snapshot. */
  cursor: number;
  /** GET /api/projects: active projects in sidebar order. */
  projects: ProjectOut[];
  /** Archived projects the world still shows boarded up (read one by one with GET /api/projects/{slug}). */
  archivedProjects: ProjectOut[];
  /** GET /api/board/{slug} per non-archived project, keyed by slug. */
  boards: Record<string, BoardResponse>;
  /** GET /api/team. */
  team: TeamSnapshot;
  /** GET /api/agents: every registered agent with `isCrewhubLead` and the projects it leads or is a member of. */
  agents: AgentOut[];
  /** GET /api/principals. */
  principals: PrincipalOut[];
  /** GET /api/watchdog. */
  watchdog: WatchdogResponse;
  /** GET /api/projects/{slug}/milestones per project with the feature on, keyed by slug. */
  milestones: Record<string, MilestoneSummary[]>;
  /** GET /api/projects/{slug}/releases per project with the feature on, keyed by slug. */
  releases: Record<string, ReleaseSummary[]>;
  /**
   * FUTURE (proposal L22): `GET /api/project-groups`. Absent from a real crewhub-loops, which has no groups; the
   * demo fills it so a seek or a loop resets the groups with everything else.
   */
  groups?: ProjectGroup[];
}

export type SourceMessage =
  /** First message, and again after a reset (demo seek back, demo loop, a future 410 or restore). */
  | { type: "snapshot"; snapshot: LoopsSnapshot }
  | { type: "event"; envelope: Envelope }
  | { type: "heartbeat"; seq: number; ts: string }
  /** A re-read of GET /api/team: after team.updated and on the 30 s poll. */
  | { type: "team"; team: TeamSnapshot };

export interface WorldSource {
  readonly mode: "demo" | "live";
  /** The source's clock in ms since the epoch (demo time for the demo). */
  now(): number;
  /** Starts delivering messages; the first one is a snapshot. Returns stop. */
  start(listener: (message: SourceMessage) => void): () => void;
  /** Refetches for thin events (read-model.md "Loading a snapshot" step 7). null when not found. */
  getTicket(ref: string): Promise<Ticket | null>;
  getProject(slug: string): Promise<ProjectOut | null>;
  getBoard(slug: string): Promise<BoardResponse | null>;
  getWatchdog(): Promise<WatchdogResponse>;
  getMilestones(slug: string): Promise<MilestoneSummary[]>;
  getReleases(slug: string): Promise<ReleaseSummary[]>;
  /**
   * FUTURE (proposal L22): the groups above projects, in order. A source for a real crewhub-loops answers `[]` until
   * loops has them; the world then puts every project in its one default zone.
   */
  listProjectGroups(): Promise<ProjectGroup[]>;
  /** Detail reads, only when a person opens a ticket (text view). */
  getComments(ref: string): Promise<CommentOut[]>;
  getProgress(ref: string): Promise<ProgressItem[]>;
  /** Present for a scripted or recorded source; null for live. */
  readonly playback: PlaybackControls | null;
}

/** Types only: the future host source (`GET /world-api/snapshot` + SSE). Not implemented tonight. */
export interface HostSourceOptions {
  baseUrl: string;
}

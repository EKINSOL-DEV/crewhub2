/**
 * The seam between a source of crewhub-loops data and the world model. The demo (`packages/demo`)
 * implements it for the demo; the host source (`GET /world-api/snapshot` + SSE, `hostSource.ts`) for a real crewhub-loops.
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
  /**
   * The source's own principal (the host's key, as `GET /api/auth/me` named it): the observer, which the world never
   * shows as a figure. Absent or null when the source has none (the demo).
   */
  observer?: string | null;
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
  /**
   * Facts the event log holds that no read carries (CL-312; `logFacts.ts`): the open quiet stretches, one `ticket.quiet`
   * envelope per ticket, on open tickets a person or an agent has not touched since; and the latest `automation.ran`
   * envelopes on open tickets. Absent from a source that did not read its log; the model applies them as the events
   * they are, below the cursor.
   */
  quiet?: Envelope[];
  automationRuns?: Envelope[];
}

export type SourceMessage =
  /** First message, and again after a reset (demo seek back, demo loop, a future 410 or restore). */
  | { type: "snapshot"; snapshot: LoopsSnapshot }
  | { type: "event"; envelope: Envelope }
  | { type: "heartbeat"; seq: number; ts: string }
  /** A re-read of GET /api/team: after team.updated and on the 30 s poll. */
  | { type: "team"; team: TeamSnapshot }
  /**
   * An agent's message to the person (round 12, the host's chat session): a speech bubble over that agent's figure with
   * the first line. Only the live host sends it; the demo's chat is its own (the copied dock).
   */
  | { type: "chat"; chat: ChatLine }
  /**
   * The chat threads' own facts (round 24), where loops lets the world's key read the chat: per agent, when the last
   * message was written and how many are unread; the whole list each time, read by the host at the key check and
   * again after a `dm.*` event it sees. Only the live host sends it.
   */
  | { type: "threads"; threads: ChatThreadFact[] };

/** One agent's chat thread as the host passes it on (`GET /api/dm/threads`: `lastMessageAt`, `unreadCount`); nothing of the messages. */
export interface ChatThreadFact {
  agentId: string;
  /** When the last message of the thread was written (ISO), by either side. */
  lastMessageAt: string;
  /** Messages the owner has not read, as loops counts them for the key's view. */
  unreadCount: number;
}

/** One line an agent said to the person, as the world shows it. Nothing more of the conversation reaches the page. */
export interface ChatLine {
  agentId: string;
  agentName?: string;
  text: string;
  /** When it was written (ISO). */
  at: string;
  messageId: string;
  threadId: string;
}

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
  /** Present for a live source (the connection chip); absent or null for the demo, which is always there. */
  readonly connection?: ConnectionStatus | null;
}

/**
 * How a live source stands with its host and the host with crewhub-loops. `connecting` until the first snapshot;
 * `catching-up` while it re-snapshots after a reset or a gap; `stale` when the stream is quiet past two heartbeats
 * or the host is unreachable; `loops-down` and `unauthorized` as the host reports them (GET /world-api/health);
 * `stream-busy` when loops refused the host's stream with 429 `too_many_streams` (another host or tab uses the key);
 * `unpaired` when the host answers 401 `not_paired` to the snapshot or the stream after the first health read (a host
 * restarted without its pairing secret, or the cookie gone): the world shows "Pair this browser" and the source keeps
 * asking, so a new link brings it back by itself.
 */
export type ConnectionState = "connecting" | "live" | "catching-up" | "stale" | "loops-down" | "unauthorized" | "stream-busy" | "unpaired";
export interface ConnectionStatus {
  state(): ConnectionState;
  /**
   * The host's own word on its key from the last status message on the stream (`HostKeyState["state"]`: none, unchecked,
   * checking, rejected, ok), or null when the host has not said (a host from before round 11, or no stream yet). The world
   * prefers it over a health read: after a Forget in another tab the stream says `key: "none"` at once.
   */
  key(): "none" | "unchecked" | "checking" | "rejected" | "ok" | null;
  /** Fires when the state or the key's word changes. */
  onChange(listener: () => void): () => void;
}

/** The live source (`packages/loops-client/src/hostSource.ts`): the world's own host at `/world-api`. */
export interface HostSourceOptions {
  /** The host's origin, e.g. `http://127.0.0.1:5180`. Default "" (same origin: Vite proxies /world-api in dev). */
  baseUrl?: string;
  /**
   * Extra request headers on every read. A browser needs none: the pairing cookie rides along same-origin. A Node
   * caller (the e2e test, a tool) passes `{ cookie: "crewhub_world_pair=…" }` after pairing.
   */
  headers?: Record<string, string>;
  /** The clocks of the source (tests make them short); see `HostSourceTimings` in `hostSource.ts`. */
  timings?: {
    staleMs?: number;
    teamPollMs?: number;
    retryMinMs?: number;
    retryMaxMs?: number;
  };
  /**
   * Re-snapshot when an event's `seq` skips past `cursor + 1`. Default false: loops filters the stream per
   * principal (events.py), so gaps between the seqs a key may see are normal; continuity is the host's job (it
   * resumes with `after=` and sends `reset` when it cannot prove it). Tests turn it on.
   */
  resnapshotOnGap?: boolean;
  /**
   * A first snapshot read ahead of the source (`prefetchSnapshot`, started by the page as soon as it knows it is live,
   * while the world's module still loads): the parsed body when it has arrived, applied synchronously in `start()`
   * when it validates, so the very first model has the town; else the pending response, which the source takes as
   * its first read instead of asking the host again. Used once; the source reads its own snapshot after that.
   */
  firstSnapshot?: { body: unknown } | { response: Promise<Response> };
  /**
   * The host's town document changed (round 20, `{type: "town", rev}` on the stream): the town runtime refetches
   * `/world-api/town`. Called with the host's revision; nothing else is read here.
   */
  onTown?: (rev: number) => void;
}

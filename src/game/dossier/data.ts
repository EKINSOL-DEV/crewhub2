// Dossier data join (M9 T1) — pure joins from store snapshots into the one
// shape the dossier card renders. No hooks, no Date.now: callers pass
// `nowMs` (the sim clock, same discipline as characters.ts's ToCharactersOpts)
// so this stays replay-safe and trivially testable.
import type { Agent, Project, Room, SessionBinding, SessionStatus } from "@/ipc/bindings";
import type { Motion } from "@/game/characters/pose";
import { characterColor, normalizeFolder } from "@/game/sim/characters";
import { getLiveBot } from "@/game/sim/live-bots";
import { shortId } from "@/stores/sessions";
import type { StoredSessionMeta } from "@/stores/sessions";

export interface DossierInfo {
  key: string;
  name: string;
  color: string;
  status: SessionStatus | "resting";
  /** When the current status started — best-known proxy, see buildDossier. Null for resting crew (no session to time). */
  statusSinceMs: number | null;
  model: string | null;
  origin: "Managed" | "External" | null;
  projectName: string | null;
  projectFolder: string | null;
  /** The linked building's project name — an explicit room binding wins over the folder match; see buildDossier. */
  roomName: string | null;
  gitBranch: string | null;
  activity: string | null;
  /** UsageTotals has no cost field (input/output/cache-read tokens only) — costUsd from the brief is dropped. */
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number } | null;
  /** Forked-from session, `provider:id`. */
  parentKey: string | null;
  /** Bound/resting crew agent's system prompt (personality hint), falling back to its name. */
  agentRole: string | null;
  /**
   * Not in the brief's literal field list — added because bio.ts's "stable
   * key = agent id for crew, else session id" needs the raw id: a crew
   * member's bio must stay the same whether they're resting (`key` is
   * already `agent:<id>`) or mid-session (`key` is the session's own id).
   * Null for sessions with no bound agent (external/unmanaged).
   */
  agentId: string | null;
  /** Sim's current Motion, humanized ("dancing", "working at a desk"). Null when the bot isn't live in the sim (getLiveBot miss). */
  motion: string | null;
}

/** Store snapshots buildDossier joins from — pass the raw maps/lists straight off the zustand stores, not a hook result. */
export interface DossierSnapshot {
  sessions: Record<string, StoredSessionMeta>;
  bindings: Record<string, SessionBinding>;
  agents: Agent[];
  rooms: Room[];
  projects: Project[];
  nowMs: number;
}

const MOTION_LABELS: Record<Motion, string> = {
  stand: "standing around",
  walk: "walking",
  "sit-type": "working at a desk",
  "raise-hand": "waiting on you",
  think: "thinking it over",
  sad: "having a rough moment",
  dance: "dancing",
  spin: "spinning",
  cheer: "cheering",
  wave: "waving hello",
};

function humanizeMotion(motion: Motion | undefined): string | null {
  return motion ? MOTION_LABELS[motion] : null;
}

/** The registered project whose normalized folder matches this bot's project path, if any. */
function findProject(projectPath: string | null, projects: Project[]): Project | null {
  if (!projectPath) return null;
  const norm = normalizeFolder(projectPath);
  return projects.find((p) => normalizeFolder(p.folder_path) === norm) ?? null;
}

/** Personality hint: an agent's own system prompt beats its bare name. */
function roleFor(agent: Agent): string {
  const prompt = agent.system_prompt?.trim();
  return prompt ? prompt : agent.name;
}

/** Join everything a dossier card needs for one bot, by its sim key. Null when the key resolves to nothing live. */
export function buildDossier(key: string, snap: DossierSnapshot): DossierInfo | null {
  const { sessions, bindings, agents, rooms, projects, nowMs } = snap;

  if (key.startsWith("agent:")) {
    const agentId = key.slice("agent:".length);
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) return null;
    const project = findProject(agent.project_path, projects);
    const bot = getLiveBot(key);
    return {
      key,
      name: agent.name,
      color: characterColor(key, agent.color),
      status: "resting",
      statusSinceMs: null,
      model: agent.default_model,
      origin: null,
      projectName: project?.name ?? null,
      projectFolder: agent.project_path ? normalizeFolder(agent.project_path) : null,
      roomName: project?.name ?? null, // resting crew has no session binding, so no explicit Room to prefer
      gitBranch: null,
      activity: null,
      usage: null,
      parentKey: null,
      agentRole: roleFor(agent),
      agentId: agent.id,
      motion: humanizeMotion(bot?.motion),
    };
  }

  const meta = sessions[key];
  if (!meta) return null;

  const binding = bindings[meta.id.id] ?? null;
  const agent = binding?.agent_id ? (agents.find((a) => a.id === binding.agent_id) ?? null) : null;
  const room = binding?.room_id ? (rooms.find((r) => r.id === binding.room_id) ?? null) : null;
  const project = findProject(meta.project_path, projects);
  const bot = getLiveBot(key);

  return {
    key,
    name: binding?.display_name ?? agent?.name ?? shortId(meta.id.id),
    color: characterColor(key, agent?.color),
    status: meta.status,
    // No per-status timestamp on SessionMeta — last_activity_ms is the best
    // available proxy for "since". Clamped to nowMs so clock skew across
    // processes can never hand a caller a "since" in the future.
    statusSinceMs: Math.min(meta.last_activity_ms, nowMs),
    model: meta.model,
    origin: meta.origin,
    projectName: project?.name ?? null,
    projectFolder: meta.project_path ? normalizeFolder(meta.project_path) : null,
    roomName: room?.name ?? project?.name ?? null,
    gitBranch: meta.git_branch,
    activity: meta.activity_detail,
    usage: {
      inputTokens: meta.usage.input_tokens,
      outputTokens: meta.usage.output_tokens,
      cacheReadTokens: meta.usage.cache_read_tokens,
    },
    parentKey: meta.parent ? `${meta.parent.provider}:${meta.parent.id}` : null,
    agentRole: agent ? roleFor(agent) : null,
    agentId: agent?.id ?? null,
    motion: humanizeMotion(bot?.motion),
  };
}

/** "5m", "3h 12m", "2d 4h" — compact enough for a dossier card's status line. */
export function humanizeDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const totalHours = Math.floor(totalMinutes / 60);
  const remMinutes = totalMinutes % 60;
  if (totalHours < 24) return remMinutes > 0 ? `${totalHours}h ${remMinutes}m` : `${totalHours}h`;
  const days = Math.floor(totalHours / 24);
  const remHours = totalHours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

/** Compact token count: 12300 → "12.3k", 999 → "999" — same formula as panels/chat/render-list.ts's formatTokens. */
export function abbrevTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 100_000 ? 1 : 0).replace(/\.0$/, "")}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

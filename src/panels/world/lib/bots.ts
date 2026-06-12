// SessionView[] → WorldBot[] (EKI-66): the pure join between live session
// data and what the 3D scene renders. Subagents (meta.parent set) follow
// their parent's room and get humanized names (v1 lesson: never show
// "parent=cc:uuid" to a human).
//
// EKI-110 (review): only RECENT sessions populate the world — the transcript
// watcher discovers every historical session on disk, and a lobby full of
// long-finished bots with stale bubbles isn't playful, it's noise. Crew
// agents without a live session rest at Headquarters instead (v1 behavior).
import type { Agent, SessionId, SessionStatus } from "@/ipc/bindings";
import type { SessionView } from "@/stores/sessions";
import { LOBBY_ID } from "./layout";

/** Sessions idle longer than this leave the world (they stay in panels). */
export const ACTIVE_WINDOW_MS = 5 * 60_000;

export interface WorldBot {
  /** Session key (`provider:id`) — stable identity across frames. */
  key: string;
  id: SessionId;
  name: string;
  status: SessionStatus;
  /** activity_detail — the above-head bubble text. */
  activity: string | null;
  color: string;
  /** Zone the bot stands in (room id or LOBBY_ID). */
  roomId: string;
  /** Cluster anchor: parent session key for subagents. */
  parentKey: string | null;
  isSubagent: boolean;
  /** Set for crew bots resting at HQ — there is no session behind them. */
  agentId: string | null;
  /** Session model (or the agent's default) — side-panel garnish. */
  model?: string | null;
}

export interface WorldBotsOpts {
  /** Crew roster; members without a live session rest at HQ. */
  agents?: Agent[] | undefined;
  /** Headquarters zone id (falls back to the lobby when absent). */
  hqId?: string | undefined;
  /** Injection point for tests; defaults to the wall clock. */
  nowMs?: number | undefined;
}

/** Soft pastel fallback palette — agents without a color still look friendly. */
export const BOT_PALETTE = [
  "#7dd3fc", // sky
  "#f9a8d4", // pink
  "#a7f3d0", // mint
  "#fcd34d", // amber
  "#c4b5fd", // violet
  "#fdba74", // peach
  "#86efac", // green
  "#a5b4fc", // indigo
] as const;

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Agent color when set; otherwise a stable soft color hashed from the key. */
export function botColor(key: string, agentColor: string | null | undefined): string {
  return agentColor ?? BOT_PALETTE[hashCode(key) % BOT_PALETTE.length]!;
}

/** v1-ported naming ladder for subagents: activity → project basename → parent. */
export function humanizeSubagentName(input: {
  activity: string | null;
  projectPath: string;
  parentName: string | null;
}): string {
  if (input.activity) return input.activity;
  const basename = input.projectPath.split("/").filter(Boolean).pop();
  if (basename) return `Subagent (${basename})`;
  return input.parentName ? `Subagent of ${input.parentName}` : "Subagent";
}

/** True when the session has an explicit human-given name (binding or agent). */
function hasExplicitName(v: SessionView): boolean {
  return Boolean(v.binding?.display_name ?? v.agent?.name);
}

export function toWorldBots(views: SessionView[], opts: WorldBotsOpts = {}): WorldBot[] {
  const { agents = [], hqId = LOBBY_ID, nowMs = Date.now() } = opts;
  // Lookups stay unfiltered so a fresh subagent still resolves its (quieter)
  // parent's room and name even when the parent bot itself left the world.
  const byKey = new Map(views.map((v) => [v.key, v]));
  const recent = views.filter(
    (v) => v.meta.status !== "Ended" && nowMs - v.meta.last_activity_ms <= ACTIVE_WINDOW_MS,
  );

  const sessionBots = recent.map((v) => {
    const parentKey = v.meta.parent ? `${v.meta.parent.provider}:${v.meta.parent.id}` : null;
    const parent = parentKey ? byKey.get(parentKey) : undefined;
    const isSubagent = parentKey !== null;

    let name = v.displayName;
    if (isSubagent && !hasExplicitName(v)) {
      name = humanizeSubagentName({
        activity: v.meta.activity_detail,
        projectPath: v.meta.project_path,
        parentName: parent?.displayName ?? null,
      });
    }

    // Subagents stand with their parent; everyone else uses their binding.
    const roomId = parent ? (parent.room?.id ?? LOBBY_ID) : (v.room?.id ?? LOBBY_ID);

    return {
      key: v.key,
      id: v.meta.id,
      name,
      status: v.meta.status,
      activity: v.meta.activity_detail,
      color: botColor(v.key, v.agent?.color),
      roomId,
      parentKey: parent ? parentKey : null,
      isSubagent,
      agentId: null,
      model: v.meta.model,
    };
  });

  // Crew members whose agent is not out working a live session rest at HQ.
  const working = new Set(recent.map((v) => v.agent?.id).filter(Boolean));
  const restingBots = agents
    .filter((a) => !working.has(a.id))
    .map((a) => ({
      key: `agent:${a.id}`,
      id: { provider: "agent", id: a.id },
      name: a.name,
      status: "Idle" as SessionStatus,
      activity: null,
      color: botColor(`agent:${a.id}`, a.color),
      roomId: hqId,
      parentKey: null,
      isSubagent: false,
      agentId: a.id,
      model: a.default_model,
    }));

  return [...sessionBots, ...restingBots];
}

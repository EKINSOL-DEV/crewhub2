// SessionView[] → Character[] (M1 T4): the pure store join feeding the
// campus sim. Ported from src/panels/world/lib/bots.ts `toWorldBots` minus
// room/zone assignment — the campus sim seats characters itself, this just
// decides who's on screen, what they're called, and what color they wear.
import type { Agent, SessionStatus } from "@/ipc/bindings";
import type { SessionView } from "@/stores/sessions";
import { hashCode } from "./rand";

/** Sessions idle longer than this leave the sim (they stay in panels). */
export const ACTIVE_WINDOW_MS = 5 * 60_000;

export interface Character {
  /** Session key (`provider:id`) — stable identity across frames. */
  key: string;
  name: string;
  status: SessionStatus;
  /** activity_detail — the above-head bubble text. */
  activity: string | null;
  color: string;
  isSubagent: boolean;
  /** Cluster anchor: parent session key for subagents. */
  parentKey: string | null;
  /** Set for crew characters resting idle — there is no session behind them. */
  agentId: string | null;
  /**
   * Normalized project folder (session's meta.project_path or crew agent's
   * project_path); null when unset. Optional so pre-M5 Character literals
   * across the app (demo world, sim/flavor tests) keep compiling untouched —
   * toCharacters() always populates it explicitly.
   */
  projectPath?: string | null;
  /**
   * Sim desk-claim eligibility key (M5 T2), mirrors Building.groupKey and is
   * annotated at the same React boundary — see src/game/characters/use-sim.ts.
   * Optional for the same pre-M5-literal reason as projectPath.
   */
  groupKey?: string | null;
}

/** Strip a single trailing "/" so folder paths compare equal regardless of it. */
export function normalizeFolder(p: string): string {
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}

export interface ToCharactersOpts {
  /** Crew roster; members without a live session rest idle. */
  agents?: Agent[] | undefined;
  /** Injection point for tests; the sim clock, never the wall clock. */
  nowMs: number;
}

/** Soft pastel fallback palette — agents without a color still look friendly. */
export const CHARACTER_PALETTE = [
  "#7dd3fc", // sky
  "#f9a8d4", // pink
  "#a7f3d0", // mint
  "#fcd34d", // amber
  "#c4b5fd", // violet
  "#fdba74", // peach
  "#86efac", // green
  "#a5b4fc", // indigo
] as const;

/** Agent color when set; otherwise a stable soft color hashed from the key. */
export function characterColor(key: string, agentColor: string | null | undefined): string {
  return agentColor ?? CHARACTER_PALETTE[hashCode(key) % CHARACTER_PALETTE.length]!;
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

export function toCharacters(views: SessionView[], opts: ToCharactersOpts): Character[] {
  const { agents = [], nowMs } = opts;
  // Lookups stay unfiltered so a fresh subagent still resolves its (quieter)
  // parent's name even when the parent character itself left the sim.
  const byKey = new Map(views.map((v) => [v.key, v]));
  const recent = views.filter(
    (v) => v.meta.status !== "Ended" && nowMs - v.meta.last_activity_ms <= ACTIVE_WINDOW_MS,
  );

  const sessionCharacters = recent.map((v) => {
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

    return {
      key: v.key,
      name,
      status: v.meta.status,
      activity: v.meta.activity_detail,
      color: characterColor(v.key, v.agent?.color),
      isSubagent,
      parentKey: parent ? parentKey : null,
      agentId: null,
      projectPath: v.meta.project_path ? normalizeFolder(v.meta.project_path) : null,
    };
  });

  // Crew members whose agent is not out working a live session rest idle.
  const working = new Set(recent.map((v) => v.agent?.id).filter(Boolean));
  const restingCharacters = agents
    .filter((a) => !working.has(a.id))
    .map((a) => ({
      key: `agent:${a.id}`,
      name: a.name,
      status: "Idle" as SessionStatus,
      activity: null,
      color: characterColor(`agent:${a.id}`, a.color),
      isSubagent: false,
      parentKey: null,
      agentId: a.id,
      projectPath: a.project_path ? normalizeFolder(a.project_path) : null,
    }));

  return [...sessionCharacters, ...restingCharacters];
}

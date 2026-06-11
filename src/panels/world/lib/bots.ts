// SessionView[] → WorldBot[] (EKI-66): the pure join between live session
// data and what the 3D scene renders. Subagents (meta.parent set) follow
// their parent's room and get humanized names (v1 lesson: never show
// "parent=cc:uuid" to a human).
import type { SessionId, SessionStatus } from "@/ipc/bindings";
import type { SessionView } from "@/stores/sessions";
import { LOBBY_ID } from "./layout";

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

export function toWorldBots(views: SessionView[]): WorldBot[] {
  const byKey = new Map(views.map((v) => [v.key, v]));
  return views
    .filter((v) => v.meta.status !== "Ended")
    .map((v) => {
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
      };
    });
}

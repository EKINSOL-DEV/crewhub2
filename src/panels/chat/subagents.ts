// Child-session items render as collapsible inline groups in the parent's
// transcript, titled by a humanized name — never `parent=` (D-M2-5).
import type { SessionMeta } from "@/ipc/bindings";
import { sessionKey, type SessionTranscript } from "@/stores/transcripts";
import { humanizeId } from "./humanize";
import { buildRenderList, entryTs, type SubagentGroup } from "./render-list";

export function buildSubagentGroups(
  parentKey: string,
  metas: Record<string, SessionMeta>,
  sessions: Record<string, SessionTranscript>,
): SubagentGroup[] {
  const out: SubagentGroup[] = [];
  for (const [key, meta] of Object.entries(metas)) {
    if (!meta.parent || sessionKey(meta.parent) !== parentKey) continue;
    const t = sessions[key];
    if (!t || t.order.length === 0) continue;
    const entries = buildRenderList(t.items, t.order);
    const first = entries[0];
    if (!first) continue;
    out.push({
      key: `sub-${key}`,
      name: humanizeId(meta.id.id),
      firstTs: entryTs(first),
      entries,
    });
  }
  return out;
}

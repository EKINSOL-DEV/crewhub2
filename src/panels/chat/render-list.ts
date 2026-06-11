// Pure transcript → render-entry mapping (D-M2-5): ToolResult joins its
// ToolUse by tool_use_id, Usage folds into the meta strip, subagent groups
// interleave by timestamp. No React in this file — exhaustively unit-tested.
import type { TranscriptItem } from "@/ipc/bindings";

export type ToolUseData = Extract<TranscriptItem, { kind: "ToolUse" }>["data"];
export type ToolResultData = Extract<TranscriptItem, { kind: "ToolResult" }>["data"];
export type UsageData = Extract<TranscriptItem, { kind: "Usage" }>["data"];

export type RenderEntry =
  | { type: "item"; key: string; seq: number; item: TranscriptItem }
  | {
      type: "tool";
      key: string;
      seq: number;
      use: ToolUseData | null; // null = orphan ToolResult (use scrolled out of the window)
      result: ToolResultData | null; // null = still running
    }
  | { type: "subagent"; key: string; name: string; firstTs: number; entries: RenderEntry[] };

/** Every TranscriptItem variant carries `ts`. */
export function itemTs(item: TranscriptItem): number {
  return item.data.ts;
}

export function entryTs(e: RenderEntry): number {
  if (e.type === "subagent") return e.firstTs;
  if (e.type === "tool") return e.use?.ts ?? e.result?.ts ?? 0;
  return itemTs(e.item);
}

/**
 * Walk the sorted seq index and produce one render entry per visible row:
 * - `Usage` items are skipped (folded into the session meta strip),
 * - each `ToolResult` is claimed by the `ToolUse` sharing its tool_use_id
 *   (unclaimed results render as orphan tool entries — never dropped).
 */
export function buildRenderList(
  items: ReadonlyMap<number, TranscriptItem>,
  order: readonly number[],
): RenderEntry[] {
  // Pass 1: first result per tool_use_id, claimed only if a matching ToolUse exists.
  const resultByUseId = new Map<string, { seq: number; data: ToolResultData }>();
  const useIds = new Set<string>();
  for (const seq of order) {
    const item = items.get(seq);
    if (!item) continue;
    if (item.kind === "ToolUse") useIds.add(item.data.tool_use_id);
    else if (item.kind === "ToolResult" && !resultByUseId.has(item.data.tool_use_id)) {
      resultByUseId.set(item.data.tool_use_id, { seq, data: item.data });
    }
  }
  const claimed = new Set<number>();
  for (const id of useIds) {
    const r = resultByUseId.get(id);
    if (r) claimed.add(r.seq);
  }

  // Pass 2: emit entries in seq order.
  const out: RenderEntry[] = [];
  for (const seq of order) {
    const item = items.get(seq);
    if (!item) continue;
    switch (item.kind) {
      case "Usage":
        break; // meta strip, not inline (D-M2-5)
      case "ToolUse": {
        const r = resultByUseId.get(item.data.tool_use_id);
        out.push({ type: "tool", key: `t${seq}`, seq, use: item.data, result: r?.data ?? null });
        break;
      }
      case "ToolResult":
        if (!claimed.has(seq)) {
          out.push({ type: "tool", key: `t${seq}`, seq, use: null, result: item.data });
        }
        break;
      default:
        out.push({ type: "item", key: `i${seq}`, seq, item });
    }
  }
  return out;
}

export interface SubagentGroup {
  key: string;
  name: string;
  firstTs: number;
  entries: RenderEntry[];
}

/** Insert each subagent group before the first parent entry newer than it. */
export function interleaveSubagents(
  entries: readonly RenderEntry[],
  groups: readonly SubagentGroup[],
): RenderEntry[] {
  if (groups.length === 0) return [...entries];
  const sorted = [...groups].sort((a, b) => a.firstTs - b.firstTs);
  const out: RenderEntry[] = [];
  let gi = 0;
  for (const e of entries) {
    while (gi < sorted.length && (sorted[gi] as SubagentGroup).firstTs <= entryTs(e)) {
      out.push({ type: "subagent", ...(sorted[gi] as SubagentGroup) });
      gi++;
    }
    out.push(e);
  }
  for (; gi < sorted.length; gi++) out.push({ type: "subagent", ...(sorted[gi] as SubagentGroup) });
  return out;
}

export interface UsageSums {
  input_tokens: number;
  output_tokens: number;
  cache_read: number;
}

/** Sum the Usage items (history mode has no live SessionMeta to read from). */
export function sumUsage(items: ReadonlyMap<number, TranscriptItem>, order: readonly number[]): UsageSums {
  const sums: UsageSums = { input_tokens: 0, output_tokens: 0, cache_read: 0 };
  for (const seq of order) {
    const item = items.get(seq);
    if (item?.kind !== "Usage") continue;
    sums.input_tokens += item.data.input_tokens;
    sums.output_tokens += item.data.output_tokens;
    sums.cache_read += item.data.cache_read;
  }
  return sums;
}

/** Compact token count: 12300 → "12.3k", 999 → "999" (plan EKI-74 shape). */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 100_000 ? 1 : 0).replace(/\.0$/, "")}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

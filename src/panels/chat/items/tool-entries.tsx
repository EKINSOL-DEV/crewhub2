// Adapters between the ITEM_RENDERERS table (one renderer per kind) and the
// joined ToolCallCard: a ToolUse renders with its paired result; an orphan
// ToolResult (its ToolUse outside the loaded window) renders alone.
import { ToolCallCard } from "./ToolCallCard";
import type { ItemProps } from "./types";

export function ToolUseEntry({ item, result }: ItemProps) {
  if (item.kind !== "ToolUse") return null;
  return <ToolCallCard use={item.data} result={result ?? null} />;
}

export function ToolResultEntry({ item }: ItemProps) {
  if (item.kind !== "ToolResult") return null;
  return <ToolCallCard use={null} result={item.data} />;
}

import { useState } from "react";
import { ITEM_RENDERERS } from "./items";
import { ToolCallCard } from "./items/ToolCallCard";
import type { RenderEntry } from "./render-list";

/** One virtualized row: item, joined tool card, or collapsible subagent group. */
export function EntryRenderer({ entry }: { entry: RenderEntry }) {
  if (entry.type === "tool") {
    return <ToolCallCard use={entry.use} result={entry.result} />;
  }
  if (entry.type === "subagent") {
    return <SubagentGroupBlock entry={entry} />;
  }
  const Renderer = ITEM_RENDERERS[entry.item.kind];
  if (!Renderer) return null; // Usage — folded into the meta strip
  return <Renderer seq={entry.seq} item={entry.item} />;
}

/** Inline collapsible group of a child session's items, humanized title (D-M2-5). */
function SubagentGroupBlock({ entry }: { entry: Extract<RenderEntry, { type: "subagent" }> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="px-3 py-1" data-testid="subagent-group">
      <div className="rounded-lg border border-border bg-card/40">
        <button
          type="button"
          data-testid="subagent-toggle"
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs"
          onClick={() => setOpen((v) => !v)}
        >
          <span aria-hidden="true">🤖</span>
          <span className="font-medium">{entry.name}</span>
          <span className="text-muted-foreground">
            {entry.entries.length} item{entry.entries.length === 1 ? "" : "s"}
          </span>
          <span className="ml-auto text-muted-foreground">{open ? "▾" : "▸"}</span>
        </button>
        {open && (
          <div className="border-t border-border" data-testid="subagent-items">
            {entry.entries.map((e) => (
              <EntryRenderer key={e.key} entry={e} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

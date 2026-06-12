// The `welcome` leaf: a registry-driven picker grid (D-M2-2 consumer #2).
// Single-letter shortcutHint keys work only here, never globally (v1 lesson).
import { useEffect } from "react";
import { useWorkspace } from "@/stores/workspace";
import { PANEL_LIST, type PanelProps } from "./panel-registry";

const PICKABLE = PANEL_LIST.filter((d) => d.kind !== "welcome" && !d.hiddenFromPicker);

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable]") !== null
  );
}

export default function WelcomePanel({ leafId }: PanelProps) {
  const replacePanel = useWorkspace((s) => s.replacePanel);
  const isFocused = useWorkspace((s) => s.focusedLeafId === leafId);

  useEffect(() => {
    if (!isFocused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isEditable(e.target)) return;
      const def = PICKABLE.find((d) => d.shortcutHint === e.key);
      if (def) {
        e.preventDefault();
        replacePanel(leafId, def.kind);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFocused, leafId, replacePanel]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-4">
      <p className="text-sm text-muted-foreground">✨ What should this panel be?</p>
      <div className="grid w-full max-w-md grid-cols-2 gap-2">
        {PICKABLE.map((def) => (
          <button
            key={def.kind}
            type="button"
            data-testid={`picker-${def.kind}`}
            onClick={() => replacePanel(leafId, def.kind)}
            className="flex items-center gap-2 rounded-md border bg-card p-2 text-left text-sm hover:bg-muted"
          >
            <span aria-hidden className="text-lg">
              {def.emoji}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{def.label}</span>
              <span className="block truncate text-xs text-muted-foreground">{def.description}</span>
            </span>
            {def.shortcutHint && (
              <kbd className="rounded border px-1 font-mono text-[10px] text-muted-foreground">
                {def.shortcutHint}
              </kbd>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

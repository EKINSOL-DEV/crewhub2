// Command palette (EKI-16): cmdk-based, fed by the extensible action registry
// in the palette store. Filtering/ranking are the store's pure functions —
// cmdk's own filter is disabled so behavior stays unit-testable.
import { Command } from "cmdk";
import { useMemo, useState } from "react";
import { filterActions, usePalette, winkHint } from "@/stores/palette";

export function CommandPalette() {
  const open = usePalette((s) => s.open);
  const openCount = usePalette((s) => s.openCount);
  // key by openCount: every open starts with a fresh query, no effects needed
  return open ? <PaletteBody key={openCount} openCount={openCount} /> : null;
}

function PaletteBody({ openCount }: { openCount: number }) {
  const sources = usePalette((s) => s.sources);
  const recents = usePalette((s) => s.recents);
  const [query, setQuery] = useState("");

  const visible = useMemo(
    () => filterActions(Object.values(sources).flat(), query, recents),
    [sources, query, recents],
  );

  const groups = useMemo(() => {
    const order: string[] = [];
    const byGroup = new Map<string, typeof visible>();
    for (const a of visible) {
      if (!byGroup.has(a.group)) {
        byGroup.set(a.group, []);
        order.push(a.group);
      }
      byGroup.get(a.group)!.push(a);
    }
    return order.map((g) => ({ name: g, actions: byGroup.get(g)! }));
  }, [visible]);

  const close = () => usePalette.getState().setOpen(false);

  return (
    <div
      data-testid="command-palette"
      className="absolute inset-0 z-50 flex items-start justify-center bg-background/60 pt-20"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <Command
        shouldFilter={false}
        label="Command palette"
        className="w-[30rem] max-w-[90vw] overflow-hidden rounded-lg border bg-card shadow-xl"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            close();
          }
        }}
      >
        <Command.Input
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder="Type a command…"
          className="w-full border-b bg-transparent px-3 py-2.5 text-sm outline-none"
        />
        <Command.List className="max-h-80 overflow-y-auto p-1">
          <Command.Empty className="p-6 text-center text-xs text-muted-foreground">
            🤷 nothing matches “{query}”
          </Command.Empty>
          {groups.map((g) => (
            <Command.Group
              key={g.name}
              heading={g.name}
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-muted-foreground"
            >
              {g.actions.map((a) => (
                <Command.Item
                  key={a.id}
                  value={a.id}
                  data-testid={`palette-action-${a.id}`}
                  onSelect={() => {
                    usePalette.getState().recordRun(a.id);
                    close();
                    void a.run();
                  }}
                  className="flex cursor-default items-center gap-2 rounded px-2 py-1.5 text-sm data-[selected=true]:bg-muted"
                >
                  <span aria-hidden className="w-5 text-center">
                    {a.emoji ?? "·"}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{a.label}</span>
                  {a.hint && (
                    <kbd className="rounded border px-1 font-mono text-[10px] text-muted-foreground">
                      {a.hint}
                    </kbd>
                  )}
                </Command.Item>
              ))}
            </Command.Group>
          ))}
        </Command.List>
        <div
          data-testid="palette-wink"
          className="select-none border-t px-3 py-1.5 text-[10px] text-muted-foreground"
        >
          {query ? `${visible.length} match${visible.length === 1 ? "" : "es"}` : winkHint(openCount)}
        </div>
      </Command>
    </div>
  );
}

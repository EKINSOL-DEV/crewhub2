// The workspace shell (EKI-11): tabs → binary split tree → panels.
// Renders the active tab's layout tree, with drag-to-resize splitters,
// drag-rearrange (edge drop-zones), keymap, per-panel chrome + error boundary.
import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Maximize2, Minimize2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { PopIn } from "@/components/PopIn";
import { commands } from "@/ipc/bindings";
import { cn } from "@/lib/utils";
import { usePalette } from "@/stores/palette";
import { useWorkspace } from "@/stores/workspace";
import { CommandPalette } from "./CommandPalette";
import { matchKey, KEYMAP_HELP } from "./keymap";
import { buildShellActions } from "./palette-actions";
import { ProjectSwitcher } from "./project-filter";
import { ShellDialogs } from "./ShellDialogs";
import {
  dropEdgeAt,
  findLeaf,
  type DropEdge,
  type LeafNode,
  type SplitNode,
  type LayoutNode,
} from "./layout-tree";
import { PANELS, PANEL_LIST } from "./panel-registry";

const LEAF_DRAG_MIME = "text/crewhub-leaf";

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable]") !== null
  );
}

// ── Error boundary: a crashing panel never takes the shell down ─────────────

export class PanelErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  override state = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  override render() {
    if (this.state.crashed) {
      return (
        <EmptyState
          emoji="💥"
          title="This panel tripped"
          hint="Something inside crashed — the rest of the shell is fine."
          action={
            <Button size="sm" variant="outline" onClick={() => this.setState({ crashed: false })}>
              Reopen
            </Button>
          }
        />
      );
    }
    return this.props.children;
  }
}

// ── Panel chrome ─────────────────────────────────────────────────────────────

const DROP_HINT_CLASS: Record<DropEdge, string> = {
  n: "inset-x-0 top-0 h-1/2",
  s: "inset-x-0 bottom-0 h-1/2",
  w: "inset-y-0 left-0 w-1/2",
  e: "inset-y-0 right-0 w-1/2",
  center: "inset-0",
};

function PanelChrome({ leaf }: { leaf: LeafNode }) {
  const def = PANELS[leaf.kind];
  const focused = useWorkspace((s) => s.focusedLeafId === leaf.id);
  const maximized = useWorkspace((s) => s.maximizedLeafId === leaf.id);
  const { focusLeaf, toggleMaximize, closePanel, setPanelParams, movePanel } = useWorkspace.getState();
  const [dropEdge, setDropEdge] = useState<DropEdge | null>(null);

  function onDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes(LEAF_DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / (rect.width || 1);
    const y = (e.clientY - rect.top) / (rect.height || 1);
    setDropEdge(dropEdgeAt(x, y));
  }

  function onDrop(e: React.DragEvent) {
    const src = e.dataTransfer.getData(LEAF_DRAG_MIME);
    e.preventDefault();
    if (src && dropEdge) movePanel(src, leaf.id, dropEdge);
    setDropEdge(null);
  }

  return (
    <section
      data-testid={`panel-${leaf.kind}`}
      data-leaf-id={leaf.id}
      data-focused={focused || undefined}
      onMouseDownCapture={() => focusLeaf(leaf.id)}
      onDragOver={onDragOver}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDropEdge(null);
      }}
      onDrop={onDrop}
      className={cn(
        "relative flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden rounded-md border bg-card",
        focused && "ring-1 ring-ring",
      )}
    >
      <header
        draggable
        data-testid={`panel-handle-${leaf.kind}`}
        onDragStart={(e) => {
          e.dataTransfer.setData(LEAF_DRAG_MIME, leaf.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => setDropEdge(null)}
        className="flex cursor-grab select-none items-center gap-1.5 border-b px-2 py-1 text-xs active:cursor-grabbing"
      >
        <span aria-hidden>{def.emoji}</span>
        <span className="font-medium">{def.label}</span>
        <span className="flex-1" />
        <button
          type="button"
          title={maximized ? "Restore (⌘⇧M)" : "Maximize (⌘⇧M)"}
          aria-label={maximized ? "Restore panel" : "Maximize panel"}
          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => toggleMaximize(leaf.id)}
        >
          {maximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
        </button>
        <button
          type="button"
          title="Close panel (⌘⇧W)"
          aria-label="Close panel"
          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => closePanel(leaf.id)}
        >
          <X size={12} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        <PanelErrorBoundary>
          <Suspense fallback={<div className="p-4 text-xs text-muted-foreground">…</div>}>
            <def.component
              leafId={leaf.id}
              params={leaf.params ?? {}}
              setParams={(p) => setPanelParams(leaf.id, p)}
            />
          </Suspense>
        </PanelErrorBoundary>
      </div>
      {dropEdge && (
        <div
          data-testid={`drop-hint-${dropEdge}`}
          className={cn(
            "pointer-events-none absolute z-10 rounded-md border-2 border-ring bg-ring/15",
            DROP_HINT_CLASS[dropEdge],
          )}
        />
      )}
    </section>
  );
}

// ── Split rendering with drag-to-resize ──────────────────────────────────────

function SplitView({ node }: { node: SplitNode }) {
  const setSplitRatio = useWorkspace((s) => s.setSplitRatio);
  const containerRef = useRef<HTMLDivElement>(null);
  const row = node.dir === "row";

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const ratio = row ? (ev.clientX - rect.left) / rect.width : (ev.clientY - rect.top) / rect.height;
      setSplitRatio(node.id, ratio);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div
      ref={containerRef}
      className={cn("flex h-full w-full min-h-0 min-w-0", row ? "flex-row" : "flex-col")}
    >
      <div
        style={{ flexBasis: `${node.ratio * 100}%` }}
        className="min-h-0 min-w-0 flex-shrink-0 flex-grow-0"
      >
        <NodeView node={node.a} />
      </div>
      <div
        role="separator"
        aria-orientation={row ? "vertical" : "horizontal"}
        data-testid={`splitter-${node.id}`}
        onPointerDown={onPointerDown}
        className={cn(
          "flex-shrink-0 bg-transparent transition-colors hover:bg-ring/60",
          row ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize",
        )}
      />
      <div className="min-h-0 min-w-0 flex-1">
        <NodeView node={node.b} />
      </div>
    </div>
  );
}

function NodeView({ node }: { node: LayoutNode }) {
  if (node.type === "leaf") {
    return (
      <PopIn key={node.id} className="h-full w-full min-h-0 min-w-0">
        <PanelChrome leaf={node} />
      </PopIn>
    );
  }
  return <SplitView node={node} />;
}

// ── Tab bar ──────────────────────────────────────────────────────────────────

function TabBar() {
  const tabs = useWorkspace((s) => s.tabs);
  const activeTabId = useWorkspace((s) => s.activeTabId);
  const { setActiveTab, addTab, closeTab, renameTab } = useWorkspace.getState();
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div role="tablist" className="flex min-w-0 items-center gap-1 overflow-x-auto">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tab"
          aria-selected={tab.id === activeTabId}
          data-testid={`tab-${tab.id}`}
          onMouseDown={() => setActiveTab(tab.id)}
          onDoubleClick={() => setEditing(tab.id)}
          className={cn(
            "group flex cursor-default items-center gap-1 rounded-md border px-2 py-0.5 text-xs",
            tab.id === activeTabId ? "bg-card" : "border-transparent text-muted-foreground hover:bg-muted",
          )}
        >
          {editing === tab.id ? (
            <input
              autoFocus
              defaultValue={tab.name}
              aria-label="Rename tab"
              className="w-24 bg-transparent text-xs outline-none"
              onBlur={(e) => {
                if (e.target.value.trim()) renameTab(tab.id, e.target.value.trim());
                setEditing(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setEditing(null);
              }}
            />
          ) : (
            <span className="whitespace-nowrap">{tab.name}</span>
          )}
          <button
            type="button"
            aria-label={`Close tab ${tab.name}`}
            className="rounded p-0.5 opacity-0 hover:bg-muted group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.id);
            }}
          >
            <X size={10} />
          </button>
        </div>
      ))}
      <button
        type="button"
        aria-label="New tab"
        title="New tab (⌘T)"
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={() => addTab()}
      >
        <Plus size={12} />
      </button>
    </div>
  );
}

// ── Shortcut help sheet (⌘/) — registry-generated ────────────────────────────

function HelpSheet({ onClose }: { onClose: () => void }) {
  const pickerHints = PANEL_LIST.filter((d) => d.shortcutHint)
    .map((d) => `${d.shortcutHint} ${d.label.toLowerCase()}`)
    .join(" · ");
  return (
    <div
      data-testid="help-sheet"
      className="absolute inset-0 z-50 flex items-center justify-center bg-background/70"
      onClick={onClose}
    >
      <div className="w-96 rounded-lg border bg-card p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-sm font-semibold">⌨️ Shortcuts</h2>
        <table className="w-full text-xs">
          <tbody>
            {KEYMAP_HELP.map((row) => (
              <tr key={row.keys}>
                <td className="py-0.5 pr-3 font-mono text-muted-foreground">{row.keys}</td>
                <td className="py-0.5">{row.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-[10px] text-muted-foreground">Inside a new panel: {pickerHints}</p>
      </div>
    </div>
  );
}

// ── The shell ────────────────────────────────────────────────────────────────

export function WorkspaceShell() {
  const loaded = useWorkspace((s) => s.loaded);
  const tab = useWorkspace((s) => s.tabs.find((t) => t.id === s.activeTabId) ?? null);
  const maximizedLeafId = useWorkspace((s) => s.maximizedLeafId);
  const [version, setVersion] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    commands
      .appInfo()
      .then((info) => setVersion(info.version))
      .catch(() => setVersion(null));
  }, []);

  useEffect(() => {
    const unregister = usePalette.getState().registerActions("shell", buildShellActions());
    void usePalette.getState().load();
    return unregister;
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = matchKey({
        key: e.key,
        mod: e.metaKey || e.ctrlKey,
        shift: e.shiftKey,
        alt: e.altKey,
        inEditable: isEditable(e.target),
      });
      if (!action) return;
      const s = useWorkspace.getState();
      switch (action.type) {
        case "palette":
          e.preventDefault();
          usePalette.getState().toggle();
          break;
        case "newTab":
          e.preventDefault();
          s.addTab();
          break;
        case "closeTab":
          e.preventDefault();
          s.closeTab(s.activeTabId);
          break;
        case "focusPanel":
          e.preventDefault();
          s.focusByIndex(action.index);
          break;
        case "cycleFocus":
          e.preventDefault();
          s.cycleFocus(action.dir);
          break;
        case "split":
          e.preventDefault();
          if (s.focusedLeafId) s.split(s.focusedLeafId, action.dir);
          break;
        case "closePanel":
          e.preventDefault();
          if (s.focusedLeafId) s.closePanel(s.focusedLeafId);
          break;
        case "maximize":
          e.preventDefault();
          s.toggleMaximize();
          break;
        case "resize":
          e.preventDefault();
          s.resizeFocused(action.axis, action.delta);
          break;
        case "help":
          e.preventDefault();
          setShowHelp((v) => !v);
          break;
        case "escape":
          if (showHelp) setShowHelp(false);
          else if (s.maximizedLeafId) s.toggleMaximize(s.maximizedLeafId);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showHelp]);

  const maximizedLeaf = tab && maximizedLeafId ? findLeaf(tab.root, maximizedLeafId) : null;

  return (
    <div data-testid="app-root" className="relative flex h-screen flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 border-b px-2 py-1.5">
        <span className="select-none text-xs font-semibold">CrewHub</span>
        <TabBar />
        <span className="flex-1" />
        <ProjectSwitcher />
        <span data-testid="app-version" className="font-mono text-[10px] text-muted-foreground">
          {version ? `v${version}` : "backend: connecting…"}
        </span>
      </header>
      <main className="min-h-0 flex-1 p-1.5">
        {!loaded || !tab ? (
          <EmptyState emoji="🛰️" title="Warming up" hint="Restoring your workspace…" />
        ) : maximizedLeaf ? (
          <PopIn key={`max-${maximizedLeaf.id}`} className="h-full w-full">
            <PanelChrome leaf={maximizedLeaf} />
          </PopIn>
        ) : (
          <NodeView node={tab.root} />
        )}
      </main>
      {showHelp && <HelpSheet onClose={() => setShowHelp(false)} />}
      <CommandPalette />
      <ShellDialogs />
    </div>
  );
}

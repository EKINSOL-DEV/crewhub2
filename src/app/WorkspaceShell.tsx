// The workspace shell (EKI-11): tabs → binary split tree → panels.
// Renders the active tab's layout tree, with drag-to-resize splitters,
// per-panel chrome + error boundary, and the welcome picker for empty leaves.
import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Maximize2, Minimize2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { commands } from "@/ipc/bindings";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/stores/workspace";
import { findLeaf, type LeafNode, type SplitNode, type LayoutNode } from "./layout-tree";
import { PANELS } from "./panel-registry";

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

function PanelChrome({ leaf }: { leaf: LeafNode }) {
  const def = PANELS[leaf.kind];
  const focused = useWorkspace((s) => s.focusedLeafId === leaf.id);
  const maximized = useWorkspace((s) => s.maximizedLeafId === leaf.id);
  const { focusLeaf, toggleMaximize, closePanel, setPanelParams } = useWorkspace.getState();

  return (
    <section
      data-testid={`panel-${leaf.kind}`}
      data-leaf-id={leaf.id}
      data-focused={focused || undefined}
      onMouseDownCapture={() => focusLeaf(leaf.id)}
      className={cn(
        "flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden rounded-md border bg-card",
        focused && "ring-1 ring-ring",
      )}
    >
      <header className="flex select-none items-center gap-1.5 border-b px-2 py-1 text-xs">
        <span aria-hidden>{def.emoji}</span>
        <span className="font-medium">{def.label}</span>
        <span className="flex-1" />
        <button
          type="button"
          title={maximized ? "Restore" : "Maximize"}
          aria-label={maximized ? "Restore panel" : "Maximize panel"}
          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => toggleMaximize(leaf.id)}
        >
          {maximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
        </button>
        <button
          type="button"
          title="Close panel"
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
  return node.type === "leaf" ? <PanelChrome leaf={node} /> : <SplitView node={node} />;
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

// ── The shell ────────────────────────────────────────────────────────────────

export function WorkspaceShell() {
  const loaded = useWorkspace((s) => s.loaded);
  const tab = useWorkspace((s) => s.tabs.find((t) => t.id === s.activeTabId) ?? null);
  const maximizedLeafId = useWorkspace((s) => s.maximizedLeafId);
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    commands
      .appInfo()
      .then((info) => setVersion(info.version))
      .catch(() => setVersion(null));
  }, []);

  const maximizedLeaf = tab && maximizedLeafId ? findLeaf(tab.root, maximizedLeafId) : null;

  return (
    <div data-testid="app-root" className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 border-b px-2 py-1.5">
        <span className="select-none text-xs font-semibold">CrewHub</span>
        <TabBar />
        <span className="flex-1" />
        <span data-testid="app-version" className="font-mono text-[10px] text-muted-foreground">
          {version ? `v${version}` : "backend: connecting…"}
        </span>
      </header>
      <main className="min-h-0 flex-1 p-1.5">
        {!loaded || !tab ? (
          <EmptyState emoji="🛰️" title="Warming up" hint="Restoring your workspace…" />
        ) : maximizedLeaf ? (
          <PanelChrome leaf={maximizedLeaf} />
        ) : (
          <NodeView node={tab.root} />
        )}
      </main>
    </div>
  );
}

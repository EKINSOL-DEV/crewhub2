// Sessions panel (T22, EKI-74): live table/cards of every managed + external
// session, joined with bindings (T18) — open, bind, interrupt, kill, handoff.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { StatusEmoji } from "@/components/StatusEmoji";
import { commands } from "@/ipc/bindings";
import { useAgentsStore } from "@/stores/agents";
import { useBindingsStore } from "@/stores/bindings";
import { useSessionsStore, useSessionsView, type SessionView } from "@/stores/sessions";
import { BindingControls } from "./BindingControls";
import { formatRelative, formatUsage } from "./format";
import { HandoffMenu } from "./HandoffMenu";
import { requestOpenChat } from "./openChat";
import { useNow } from "./useNow";

function OriginBadge({ origin }: { origin: SessionView["meta"]["origin"] }) {
  return (
    <span
      className={`rounded px-1 text-[10px] uppercase ${
        origin === "Managed" ? "bg-accent/20 text-accent" : "bg-muted text-muted-foreground"
      }`}
    >
      {origin}
    </span>
  );
}

function RowActions({
  view,
  bindOpen,
  onToggleBind,
  onError,
}: {
  view: SessionView;
  bindOpen: boolean;
  onToggleBind: () => void;
  onError: (msg: string) => void;
}) {
  const [confirmKill, setConfirmKill] = useState(false);
  const alive = view.meta.status !== "Ended";

  const run = async (p: Promise<{ status: "ok" } | { status: "error"; error: string }>) => {
    const res = await p;
    if (res.status === "error") onError(res.error);
  };

  return (
    <span className="flex items-center gap-1">
      <Button
        size="xs"
        variant="outline"
        onClick={() => requestOpenChat({ provider: view.meta.id.provider, id: view.meta.id.id })}
      >
        Open
      </Button>
      <Button size="xs" variant={bindOpen ? "default" : "outline"} onClick={onToggleBind}>
        Bind
      </Button>
      {alive && (
        <Button
          size="xs"
          variant="outline"
          title="Interrupt the current turn"
          onClick={() => void run(commands.interruptSession(view.meta.id))}
        >
          Interrupt
        </Button>
      )}
      {alive &&
        (confirmKill ? (
          <Button
            size="xs"
            variant="destructive"
            onClick={() => {
              setConfirmKill(false);
              void run(commands.killSession(view.meta.id));
            }}
          >
            Sure?
          </Button>
        ) : (
          <Button size="xs" variant="ghost" onClick={() => setConfirmKill(true)}>
            Kill
          </Button>
        ))}
      <HandoffMenu projectPath={view.meta.project_path} sessionId={view.meta.id.id} />
    </span>
  );
}

// Accepts registry PanelProps; only `params.projectFilter` is read.
// TODO(merge): take the filter from Lane A's useProjectFilter (EKI-22).
export function SessionsPanel({ params }: { params?: Record<string, string> }) {
  const loaded = useSessionsStore((s) => s.loaded);
  const views = useSessionsView(params?.["projectFilter"] ?? null);
  const [mode, setMode] = useState<"table" | "cards">("table");
  const [bindingFor, setBindingFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = useNow();

  useEffect(() => {
    void useSessionsStore.getState().init();
    void useBindingsStore.getState().init();
    void useAgentsStore.getState().init();
  }, []);

  const bindingView = bindingFor ? (views.find((v) => v.key === bindingFor) ?? null) : null;

  return (
    <div data-testid="sessions-panel" className="flex h-full flex-col gap-2 overflow-auto p-3">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-sm font-semibold">🖥️ Sessions</h2>
        <Button
          size="xs"
          variant="outline"
          data-testid="view-toggle"
          onClick={() => setMode((m) => (m === "table" ? "cards" : "table"))}
        >
          {mode === "table" ? "Cards" : "Table"}
        </Button>
      </div>

      {error && (
        <p data-testid="sessions-error" className="text-xs text-red-400">
          {error}
        </p>
      )}

      {loaded && views.length === 0 && (
        <EmptyState
          emoji="🏢"
          title="The office is quiet"
          hint="Spawn a crew member or start a Claude Code session in a terminal — it will show up here."
        />
      )}

      {bindingView && <BindingControls view={bindingView} onClose={() => setBindingFor(null)} />}

      {views.length > 0 && mode === "table" && (
        <table data-testid="sessions-table" className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="px-2 py-1">status</th>
              <th className="px-2 py-1">name</th>
              <th className="px-2 py-1">origin</th>
              <th className="px-2 py-1">agent</th>
              <th className="px-2 py-1">room</th>
              <th className="px-2 py-1">model</th>
              <th className="px-2 py-1">tokens</th>
              <th className="px-2 py-1">branch</th>
              <th className="px-2 py-1">last</th>
              <th className="px-2 py-1">actions</th>
            </tr>
          </thead>
          <tbody>
            {views.map((v) => (
              <tr
                key={v.key}
                data-testid={`session-row-${v.meta.id.id}`}
                className="pop-in border-b align-middle"
              >
                <td className="px-2 py-1 whitespace-nowrap">
                  <StatusEmoji status={v.meta.status} />{" "}
                  <span className="text-muted-foreground" title={v.meta.activity_detail ?? ""}>
                    {v.meta.activity_detail ?? v.meta.status}
                  </span>
                </td>
                <td className="max-w-40 truncate px-2 py-1 font-medium" title={v.meta.id.id}>
                  {v.binding?.pinned ? "📌 " : ""}
                  {v.displayName}
                </td>
                <td className="px-2 py-1">
                  <OriginBadge origin={v.meta.origin} />
                </td>
                <td className="px-2 py-1">{v.agent ? `${v.agent.icon ?? "🤖"} ${v.agent.name}` : "—"}</td>
                <td className="px-2 py-1">{v.room?.name ?? "—"}</td>
                <td className="px-2 py-1 font-mono">{v.meta.model ?? "—"}</td>
                <td className="px-2 py-1 font-mono">{formatUsage(v.meta.usage)}</td>
                <td className="max-w-28 truncate px-2 py-1 font-mono">{v.meta.git_branch ?? "—"}</td>
                <td className="px-2 py-1 whitespace-nowrap">
                  {formatRelative(v.meta.last_activity_ms, now)}
                </td>
                <td className="px-2 py-1">
                  <RowActions
                    view={v}
                    bindOpen={bindingFor === v.key}
                    onToggleBind={() => setBindingFor((k) => (k === v.key ? null : v.key))}
                    onError={setError}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {views.length > 0 && mode === "cards" && (
        <div data-testid="sessions-cards" className="flex flex-wrap gap-2">
          {views.map((v) => (
            <div key={v.key} className="pop-in flex w-56 flex-col gap-1 rounded border p-2 text-xs">
              <div className="flex items-center gap-1">
                <StatusEmoji status={v.meta.status} />
                <span className="flex-1 truncate font-medium" title={v.meta.id.id}>
                  {v.binding?.pinned ? "📌 " : ""}
                  {v.displayName}
                </span>
                <OriginBadge origin={v.meta.origin} />
              </div>
              <p className="truncate text-muted-foreground">
                {v.meta.activity_detail ?? v.meta.status} · {formatRelative(v.meta.last_activity_ms, now)}
              </p>
              <p className="truncate font-mono text-muted-foreground">
                {v.meta.model ?? "?"} · {formatUsage(v.meta.usage)}
                {v.meta.git_branch ? ` · ${v.meta.git_branch}` : ""}
              </p>
              {(v.agent || v.room) && (
                <p className="truncate">
                  {v.agent ? `${v.agent.icon ?? "🤖"} ${v.agent.name}` : ""}
                  {v.agent && v.room ? " · " : ""}
                  {v.room ? `🚪 ${v.room.name}` : ""}
                </p>
              )}
              <RowActions
                view={v}
                bindOpen={bindingFor === v.key}
                onToggleBind={() => setBindingFor((k) => (k === v.key ? null : v.key))}
                onError={setError}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

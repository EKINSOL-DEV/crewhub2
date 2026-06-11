// Activity feed panel (T23, EKI-76): live stream with filter chips, Today /
// Earlier grouping, loud conflicts and click-through into the session's chat.
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { useActivityStore, groupActivity, type ActivityEntry } from "@/stores/activity";
import { useAgentsStore } from "@/stores/agents";
import { useBindingsStore } from "@/stores/bindings";
import { useSessionsStore, useSessionsView } from "@/stores/sessions";
import { openChatPanel } from "@/app/open-chat";
import { useNow } from "../sessions/useNow";

function Chip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2 py-0.5 text-xs ${
        active ? "border-accent bg-accent/15" : "border-border text-muted-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function Row({ entry, name }: { entry: ActivityEntry; name: string | null }) {
  const time = new Date(entry.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const body = (
    <>
      <span aria-hidden>{entry.emoji}</span>
      {name && <span className="shrink-0 font-medium">{name}</span>}
      <span className="flex-1 truncate text-left" title={entry.text}>
        {entry.text}
      </span>
      <span className="shrink-0 text-muted-foreground">{time}</span>
    </>
  );
  const className = `flex w-full items-center gap-2 rounded px-1 py-0.5 text-xs ${
    entry.loud ? "border border-red-500/60 bg-red-500/10 font-medium" : ""
  }`;
  if (!entry.sessionId) {
    return (
      <div data-testid={`activity-${entry.id}`} className={className}>
        {body}
      </div>
    );
  }
  const target = entry.sessionId;
  return (
    <button
      type="button"
      data-testid={`activity-${entry.id}`}
      className={`${className} hover:bg-accent/10`}
      title="Open this session's chat"
      onClick={() =>
        openChatPanel(
          entry.seq === undefined
            ? { provider: target.provider, id: target.id }
            : { provider: target.provider, id: target.id, seq: entry.seq },
        )
      }
    >
      {body}
    </button>
  );
}

// Accepts registry PanelProps; none used yet (project filter comes via Lane A's hook).
export function ActivityPanel() {
  const { entries, loaded } = useActivityStore();
  const views = useSessionsView();
  const [sessionFilter, setSessionFilter] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const now = useNow();

  useEffect(() => {
    void useActivityStore.getState().init();
    void useSessionsStore.getState().init();
    void useBindingsStore.getState().init();
    void useAgentsStore.getState().init();
  }, []);

  const nameByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of views) m.set(v.key, v.displayName);
    return m;
  }, [views]);

  const agents = useAgentsStore((s) => s.agents);
  const sessionKeysForAgent = useMemo(() => {
    if (!agentFilter) return null;
    return new Set(views.filter((v) => v.binding?.agent_id === agentFilter).map((v) => v.key));
  }, [agentFilter, views]);

  const filtered = entries.filter((e) => {
    if (sessionFilter && e.sessionKey !== sessionFilter) return false;
    if (sessionKeysForAgent && (!e.sessionKey || !sessionKeysForAgent.has(e.sessionKey))) return false;
    return true;
  });
  const groups = groupActivity(filtered, now);

  const activeSessionKeys = [...new Set(entries.map((e) => e.sessionKey).filter(Boolean))] as string[];

  return (
    <div data-testid="activity-panel" className="flex h-full flex-col gap-2 overflow-auto p-3">
      <h2 className="text-sm font-semibold">📡 Activity</h2>

      {!loaded && (
        <p data-testid="activity-loading" className="text-xs text-muted-foreground">
          listening…
        </p>
      )}

      {loaded && (activeSessionKeys.length > 0 || agents.length > 0) && (
        <div className="flex flex-wrap gap-1">
          <Chip
            active={!sessionFilter && !agentFilter}
            label="All"
            onClick={() => {
              setSessionFilter(null);
              setAgentFilter(null);
            }}
          />
          {agents.map((a) => (
            <Chip
              key={a.id}
              active={agentFilter === a.id}
              label={`${a.icon ?? "🤖"} ${a.name}`}
              onClick={() => {
                setAgentFilter((cur) => (cur === a.id ? null : a.id));
                setSessionFilter(null);
              }}
            />
          ))}
          {activeSessionKeys.map((k) => (
            <Chip
              key={k}
              active={sessionFilter === k}
              label={nameByKey.get(k) ?? k.split(":")[1]?.slice(0, 8) ?? k}
              onClick={() => {
                setSessionFilter((cur) => (cur === k ? null : k));
                setAgentFilter(null);
              }}
            />
          ))}
        </div>
      )}

      {loaded && filtered.length === 0 && (
        <EmptyState
          emoji="🍃"
          title="All calm"
          hint="Tool calls, messages, conflicts and lifecycle events stream in here as your crew works."
        />
      )}

      {groups.map((g) => (
        <section key={g.label}>
          <h3 className="mb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            {g.label}
          </h3>
          <div className="flex flex-col gap-0.5">
            {g.entries.map((e) => (
              <Row key={e.id} entry={e} name={e.sessionKey ? (nameByKey.get(e.sessionKey) ?? null) : null} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

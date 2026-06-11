// Coffee Standup (T12, EKI-21 UI — D-M4-10): each agent's entry is a sticky
// note with a ☕; agents who never answered get the "(no response 🤷)" note
// styled as cold coffee — the engine's honesty rendered, never hidden.
// `run_standup` returns the row immediately; entries stream in through the
// StandupChanged fold. "Schedule this" deep-links Lane H's schedule editor
// with a prefilled standup run spec (params only — no cross-lane code).
import "./meetings.css";
import { useState } from "react";
import { PANELS } from "@/app/panel-registry";
import { openPanel } from "@/app/palette-actions";
import type { PanelKind } from "@/app/layout-tree";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import type { Standup, StandupEntry } from "@/ipc/bindings";
import { useAgentsStore } from "@/stores/agents";
import { isNoResponse, sortStandups, standupRunSpecParams, useStandupsStore } from "@/stores/meetings";
import { useToasts } from "@/stores/toasts";

const DEFAULT_TITLE = "Daily standup";

/** Params-only deep link into Lane H's schedule editor (T12→T13 contract). */
export function scheduleStandup(agentIds: string[], title: string): boolean {
  const params = standupRunSpecParams(agentIds, title);
  if ("automation" in PANELS) {
    openPanel("automation" as PanelKind, params);
    return true;
  }
  // Lane H hasn't merged yet — be honest instead of silently dropping it.
  useToasts.getState().push({
    emoji: "⏰",
    text: "the automation panel isn't aboard yet — scheduling lands with Lane H",
    taskId: null,
    shake: false,
    action: null,
  });
  return false;
}

function StickyNote({ entry, name, icon }: { entry: StandupEntry; name: string; icon: string }) {
  const cold = isNoResponse(entry);
  return (
    <div className="sticky-note text-xs" data-testid={`standup-note-${entry.id}`} data-cold={cold}>
      <div className="mb-1 flex items-center gap-1 font-medium">
        <span aria-hidden>{cold ? "🥶" : "☕"}</span>
        <span aria-hidden>{icon}</span>
        <span className="min-w-0 flex-1 truncate">{name}</span>
      </div>
      {cold ? (
        <p className="text-muted-foreground" data-testid={`cold-coffee-${entry.id}`}>
          🤷 (no response) — the coffee went cold
        </p>
      ) : (
        <dl className="flex flex-col gap-1">
          <div>
            <dt className="text-[10px] uppercase text-muted-foreground">yesterday</dt>
            <dd>{entry.yesterday ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase text-muted-foreground">today</dt>
            <dd>{entry.today ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase text-muted-foreground">blockers</dt>
            <dd>{entry.blockers ?? "none 🎉"}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

function RunStandupForm({ onError }: { onError: (msg: string) => void }) {
  const agents = useAgentsStore((s) => s.agents);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const run = async () => {
    setBusy(true);
    const res = await useStandupsStore
      .getState()
      .run(selected.size > 0 ? [...selected] : null, title.trim() || DEFAULT_TITLE);
    setBusy(false);
    if (res.status === "error") onError(`couldn't run the standup — ${res.error}`);
  };

  return (
    <div className="flex flex-col gap-2 rounded border p-2 text-xs" data-testid="run-standup-form">
      <div className="flex items-center gap-2">
        <input
          aria-label="Standup title"
          className="rounded border bg-background px-2 py-1"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Button size="xs" disabled={busy} data-testid="run-standup-now" onClick={() => void run()}>
          {busy ? "Brewing…" : "☕ Run standup now"}
        </Button>
        <Button
          size="xs"
          variant="outline"
          data-testid="schedule-standup"
          title="prefill a scheduled standup in the automation panel"
          onClick={() => scheduleStandup([...selected], title.trim() || DEFAULT_TITLE)}
        >
          ⏰ Schedule this
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-muted-foreground">who:</span>
        {agents.map((a) => (
          <button
            key={a.id}
            type="button"
            role="checkbox"
            aria-checked={selected.has(a.id)}
            data-testid={`standup-agent-${a.id}`}
            onClick={() => toggle(a.id)}
            className={`rounded-full border px-2 py-0.5 ${
              selected.has(a.id) ? "border-ring bg-muted font-medium" : "text-muted-foreground"
            }`}
          >
            {a.icon ?? "🤖"} {a.name}
          </button>
        ))}
        <span className="text-[10px] text-muted-foreground">
          {selected.size === 0 ? "(nobody picked = the whole crew)" : `${selected.size} picked`}
        </span>
      </div>
    </div>
  );
}

export function StandupView({ onError }: { onError: (msg: string) => void }) {
  const standups = useStandupsStore((s) => s.standups);
  const entriesByStandup = useStandupsStore((s) => s.entries);
  const loaded = useStandupsStore((s) => s.loaded);
  const agents = useAgentsStore((s) => s.agents);
  const [openId, setOpenId] = useState<string | null>(null);

  const ordered = sortStandups([...standups.values()]);
  const current: Standup | null = (openId ? standups.get(openId) : undefined) ?? ordered[0] ?? null;
  const entries = current ? (entriesByStandup.get(current.id) ?? []) : [];

  const agentOf = (id: string) => agents.find((a) => a.id === id) ?? null;

  return (
    <div className="flex flex-col gap-3" data-testid="standup-view">
      <RunStandupForm onError={onError} />

      {loaded && ordered.length === 0 ? (
        <EmptyState emoji="☕" title="No standups yet" hint="☕ no standups yet — the crew sleeps in" />
      ) : (
        <>
          {ordered.length > 0 && (
            <div className="flex flex-wrap gap-1 text-xs" data-testid="standup-history">
              {ordered.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  data-testid={`standup-row-${s.id}`}
                  aria-pressed={current?.id === s.id}
                  className={`rounded-full border px-2 py-0.5 ${
                    current?.id === s.id ? "border-ring bg-muted font-medium" : "text-muted-foreground"
                  }`}
                  onClick={() => setOpenId(s.id)}
                >
                  ☕ {s.title} · {new Date(s.created_at).toLocaleString()}
                </button>
              ))}
            </div>
          )}

          {current && entries.length === 0 && (
            <p className="text-xs text-muted-foreground" data-testid="standup-brewing">
              ☕ brewing — entries stream in as agents reply
            </p>
          )}

          {current && entries.length > 0 && (
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-3" data-testid="standup-notes">
              {entries.map((e) => {
                const a = agentOf(e.agent_id);
                return (
                  <StickyNote key={e.id} entry={e} name={a?.name ?? e.agent_id} icon={a?.icon ?? "🤖"} />
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

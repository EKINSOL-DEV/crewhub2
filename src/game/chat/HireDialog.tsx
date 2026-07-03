// Hire / adopt overlay (M2 T5): the front door for turning an idle agent
// or a settled/external session into a live chat window. Restyled per
// ChatWindow's chunky white/slate game look — a centered Card over a
// blurred backdrop, not a shadcn side panel.
//
// State resets by mounting, not by effects: the outer component only
// mounts <HireDialogInner> while `open`, so closing/reopening always
// starts fresh; picking a different agent remounts <HireForm> via
// `key={agent.id}` so its model/prompt reset too. No setState-in-effect.
import { useEffect, useMemo, useState } from "react";
import { ModelPicker, isModelTierId, type ModelTierId } from "@/components/ModelPicker";
import { playSfx } from "@/game/audio/sfx";
import { commands, type Agent, type SessionMeta } from "@/ipc/bindings";
import { useAgentsStore } from "@/stores/agents";
import { useSessionsView, type SessionView } from "@/stores/sessions";
import { adoptSession, canTakeOver, hireAgent } from "./hire";
import { useGameChats } from "./store";

const FALLBACK_COLOR = "#94a3b8";
const RECENT_LIMIT = 15;

/** "5m ago" / "3h ago" / "2d ago" — enough context to pick between sessions. */
export function relativeTime(ms: number, nowMs: number): string {
  const mins = Math.max(0, Math.round((nowMs - ms) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Live enough to just open a chat: still running, and either not tracked by
 * CrewHub (External) or not yet bound to a game window. */
function isLive(v: SessionView): boolean {
  return v.meta.status !== "Ended" && (v.meta.origin === "External" || v.binding === null);
}

export interface HireDialogProps {
  open: boolean;
  initialAgentId?: string | undefined;
  onClose: () => void;
}

export function HireDialog({ open, initialAgentId, onClose }: HireDialogProps) {
  if (!open) return null;
  return <HireDialogInner initialAgentId={initialAgentId} onClose={onClose} />;
}

function HireDialogInner({
  initialAgentId,
  onClose,
}: {
  initialAgentId: string | undefined;
  onClose: () => void;
}) {
  const agents = useAgentsStore((s) => s.agents);
  const views = useSessionsView();
  const [tab, setTab] = useState<"hire" | "adopt">("hire");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(initialAgentId ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) ?? null;

  const adoptable = useMemo(
    () =>
      views
        .filter((v) => isLive(v) || canTakeOver(v.meta))
        .sort((a, b) => b.meta.last_activity_ms - a.meta.last_activity_ms)
        .slice(0, RECENT_LIMIT),
    [views],
  );

  // Session titles (live feedback): bare id prefixes are unusable. The CLI
  // already writes a summary line per session — listArchivedSessions surfaces
  // it, so no extra model call is needed; join by "provider:id" key.
  const [summaries, setSummaries] = useState<Map<string, string>>(new Map());
  // Captured once at mount — the dialog is short-lived, so "5m ago" drifting
  // by the seconds it stays open is fine (and render stays pure).
  const [nowMs] = useState(() => Date.now());
  useEffect(() => {
    if (tab !== "adopt") return;
    let cancelled = false;
    commands
      .listArchivedSessions(null)
      .then((res) => {
        if (cancelled || res.status !== "ok") return;
        const map = new Map<string, string>();
        for (const s of res.data) {
          if (s.summary) map.set(`${s.id.provider}:${s.id.id}`, s.summary);
        }
        setSummaries(map);
      })
      .catch(() => {
        // best-effort: rows fall back to displayName
      });
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const hire = async (agent: Agent, model: ModelTierId, prompt: string | null) => {
    setBusy(true);
    setError(null);
    try {
      const result = await hireAgent(agent, { model, prompt });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      // Accepted debt: open() below also plays "chat-open", so a hire fires
      // two short cues back-to-back. Deliberate — a combined cue isn't worth
      // special-casing the store.
      playSfx("hire");
      useGameChats.getState().open(result.key);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const openChat = (key: string) => {
    useGameChats.getState().open(key);
    onClose();
  };

  const adopt = async (meta: SessionMeta, fork: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const result = await adoptSession(meta, { fork });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      useGameChats.getState().open(result.key);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        data-testid="hire-dialog"
        className="flex max-h-[80vh] w-[440px] flex-col rounded-3xl border-2 border-white/60 bg-white/90 text-slate-900 shadow-2xl backdrop-blur"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 rounded-t-3xl border-b-2 border-slate-900/10 px-4 py-3">
          <span className="flex-1 font-bold">👥 Crew</span>
          <button
            type="button"
            aria-label="Close"
            className="rounded-full px-1.5 py-0.5 font-bold hover:bg-slate-900/10"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="flex gap-1 border-b-2 border-slate-900/10 px-3 pt-2">
          <button
            type="button"
            data-testid="hire-tab-hire"
            className={`rounded-t-lg px-3 py-1.5 text-sm font-medium ${
              tab === "hire" ? "bg-slate-900/10" : "text-slate-500 hover:bg-slate-900/5"
            }`}
            onClick={() => setTab("hire")}
          >
            Hire crew
          </button>
          <button
            type="button"
            data-testid="hire-tab-adopt"
            className={`rounded-t-lg px-3 py-1.5 text-sm font-medium ${
              tab === "adopt" ? "bg-slate-900/10" : "text-slate-500 hover:bg-slate-900/5"
            }`}
            onClick={() => setTab("adopt")}
          >
            Adopt session
          </button>
        </div>

        {error && (
          <div
            className="mx-3 mt-2 rounded-lg bg-red-100 px-3 py-1.5 text-xs text-red-700"
            data-testid="hire-error"
          >
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3">
          {tab === "hire" ? (
            <div className="flex flex-col gap-3">
              <ul className="flex flex-col gap-1" data-testid="hire-agent-list">
                {agents.length === 0 && <li className="text-sm text-slate-500">No crew defined yet.</li>}
                {agents.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      data-testid={`hire-agent-${a.id}`}
                      onClick={() => {
                        setSelectedAgentId(a.id);
                        setError(null);
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${
                        selectedAgentId === a.id ? "bg-slate-900/10 font-medium" : "hover:bg-slate-900/5"
                      }`}
                    >
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: a.color ?? FALLBACK_COLOR }}
                      />
                      {a.name}
                    </button>
                  </li>
                ))}
              </ul>

              {selectedAgent && (
                <HireForm
                  key={selectedAgent.id}
                  agent={selectedAgent}
                  busy={busy}
                  onSubmit={(model, prompt) => void hire(selectedAgent, model, prompt)}
                />
              )}
            </div>
          ) : (
            <ul className="flex flex-col gap-1" data-testid="adopt-list">
              {adoptable.length === 0 && <li className="text-sm text-slate-500">No adoptable sessions.</li>}
              {adoptable.map((v) => (
                <li
                  key={v.key}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-900/5"
                  data-testid={`adopt-row-${v.key}`}
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: v.agent?.color ?? FALLBACK_COLOR }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      {v.agent || v.binding?.display_name
                        ? v.displayName
                        : (summaries.get(v.key) ?? v.displayName)}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {relativeTime(v.meta.last_activity_ms, nowMs)}
                      {" · "}
                      {v.meta.project_path.split("/").pop()}
                    </span>
                  </span>
                  {isLive(v) && (
                    <button
                      type="button"
                      data-testid={`adopt-open-${v.key}`}
                      onClick={() => openChat(v.key)}
                      className="rounded-full border border-slate-900/10 px-2.5 py-1 text-xs hover:bg-slate-900/10"
                    >
                      Open chat
                    </button>
                  )}
                  {canTakeOver(v.meta) && (
                    <>
                      <button
                        type="button"
                        data-testid={`adopt-takeover-${v.key}`}
                        disabled={busy}
                        onClick={() => void adopt(v.meta, false)}
                        className="rounded-full border border-slate-900/10 px-2.5 py-1 text-xs hover:bg-slate-900/10 disabled:opacity-50"
                      >
                        Take over
                      </button>
                      <button
                        type="button"
                        data-testid={`adopt-fork-${v.key}`}
                        disabled={busy}
                        onClick={() => void adopt(v.meta, true)}
                        className="rounded-full border border-slate-900/10 px-2.5 py-1 text-xs hover:bg-slate-900/10 disabled:opacity-50"
                      >
                        Fork
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/** Model + first-message picker for the currently-selected hire candidate.
 * Keyed by agent id from the parent so switching agents remounts it fresh
 * instead of needing an effect to resync the default model. */
function HireForm({
  agent,
  busy,
  onSubmit,
}: {
  agent: Agent;
  busy: boolean;
  onSubmit: (model: ModelTierId, prompt: string | null) => void;
}) {
  const [model, setModel] = useState<ModelTierId>(
    isModelTierId(agent.default_model) ? agent.default_model : "sonnet",
  );
  const [prompt, setPrompt] = useState("");

  return (
    <div className="flex flex-col gap-2 border-t-2 border-slate-900/10 pt-3">
      <ModelPicker value={model} onChange={setModel} />
      <input
        data-testid="hire-prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="First message (optional)…"
        className="h-9 rounded-full border-2 border-slate-900/10 bg-white px-3 text-sm outline-none"
      />
      <button
        type="button"
        data-testid="hire-go"
        disabled={busy}
        onClick={() => onSubmit(model, prompt.trim() ? prompt.trim() : null)}
        className="self-start rounded-full border-2 border-white/60 bg-emerald-700/90 px-4 py-1.5 text-sm font-bold text-white shadow disabled:opacity-50"
      >
        {busy ? "…" : `Hire ${agent.name}`}
      </button>
    </div>
  );
}

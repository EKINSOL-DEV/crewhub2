// Side panels for in-world selection (EKI-71 → EKI-118): v1's right-hand
// room/bot panels, reborn lean — a full-height sidebar with stats, occupants,
// project context and actions. Conversations live in the floating chat
// window (WorldChatWindow); the workspace chat stays the power tool.
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { openChatPanel } from "@/app/open-chat";
import { openPanel } from "@/app/palette-actions";
import { StatusEmoji } from "@/components/StatusEmoji";
import { Button } from "@/components/ui/button";
import { commands } from "@/ipc/bindings";
import { agentSpawnSpec } from "@/panels/crew/crew-status";
import { useAgentsStore } from "@/stores/agents";
import { useBindingsStore } from "@/stores/bindings";
import { useProjectsStore } from "@/stores/projects";
import { sessionKey } from "@/stores/sessions";
import type { WorldBot } from "./lib/bots";
import { LOBBY_ID, type WorldZone } from "./lib/layout";
import { statusGlow } from "./lib/status";
import { useBotChat } from "./use-bot-chat";

function SideShell({
  title,
  onClose,
  children,
}: {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="pointer-events-auto absolute bottom-9 right-2 top-2 z-10 flex w-72 flex-col rounded-md border bg-card/95 text-sm shadow-lg backdrop-blur">
      <div className="flex items-center gap-2 border-b px-3 py-2.5">
        <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
        <button
          type="button"
          aria-label="Close"
          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">{children}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 mt-4 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground first:mt-0">
      {children}
    </p>
  );
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-0.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

export function BotActionsCard({
  bot,
  onClose,
  onOpenChat,
}: {
  bot: WorldBot;
  onClose: () => void;
  /** Opens the floating in-world chat window for this bot (EKI-118). */
  onOpenChat?: (() => void) | undefined;
}) {
  const [error, setError] = useState<string | null>(null);
  const [confirmKill, setConfirmKill] = useState(false);
  const { lines } = useBotChat(bot);

  const run = async (p: Promise<{ status: "ok" } | { status: "error"; error: string }>) => {
    const res = await p;
    if (res.status === "error") setError(res.error);
  };

  return (
    <SideShell
      title={
        <>
          <StatusEmoji status={bot.status} className="mr-1" /> {bot.name}
        </>
      }
      onClose={onClose}
    >
      <SectionLabel>Status</SectionLabel>
      <p className="text-xs">
        {statusGlow(bot.status).label}
        {bot.model ? <span className="text-muted-foreground"> · {bot.model}</span> : null}
      </p>
      {bot.activity && <p className="mt-1 text-xs text-muted-foreground">{bot.activity}</p>}

      <SectionLabel>Actions</SectionLabel>
      <div className="flex flex-wrap gap-1.5">
        {onOpenChat && (
          <Button size="xs" onClick={onOpenChat}>
            💬 Chat
          </Button>
        )}
        <Button
          size="xs"
          variant="outline"
          onClick={() => {
            openChatPanel({ provider: bot.id.provider, id: bot.id.id });
            onClose();
          }}
        >
          Full chat
        </Button>
        <Button size="xs" variant="outline" onClick={() => void run(commands.interruptSession(bot.id))}>
          Interrupt
        </Button>
        <Button
          size="xs"
          variant={confirmKill ? "destructive" : "outline"}
          onClick={() => {
            if (!confirmKill) {
              setConfirmKill(true);
              return;
            }
            void run(commands.killSession(bot.id));
            onClose();
          }}
        >
          {confirmKill ? "Really kill?" : "Kill"}
        </Button>
      </div>

      {lines.length > 0 && (
        <>
          <SectionLabel>Recent activity</SectionLabel>
          <div className="flex flex-col gap-1">
            {lines.slice(-6).map((l, i) => (
              <div
                key={i}
                className={
                  l.who === "bot"
                    ? "max-w-[90%] self-start rounded-lg rounded-bl-sm bg-muted px-2 py-1 text-xs leading-snug"
                    : "max-w-[90%] self-end rounded-lg rounded-br-sm bg-primary/15 px-2 py-1 text-xs leading-snug"
                }
              >
                {l.text.length > 160 ? `${l.text.slice(0, 159)}…` : l.text}
              </div>
            ))}
          </div>
        </>
      )}

      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
    </SideShell>
  );
}

/**
 * Crew member resting at HQ (EKI-110): there is no session behind this bot —
 * but a message wakes them (EKI-116): spawn the agent's session with the text
 * as its first prompt, bind it to this room, and hand the selection over.
 * Agents without a home project borrow the room's project (EKI-118); only
 * when neither exists do we point at the crew editor.
 */
export function CrewRestCard({
  bot,
  onClose,
  onSpawned,
}: {
  bot: WorldBot;
  onClose: () => void;
  /** Receives the new session bot's key — caller moves the selection there. */
  onSpawned?: ((key: string) => void) | undefined;
}) {
  const agent = useAgentsStore((s) => s.agents.find((a) => a.id === bot.agentId));
  const rooms = useBindingsStore((s) => s.rooms);
  const projects = useProjectsStore((s) => s.projects);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The room's project is the fallback workplace for homeless agents.
  const room = rooms.find((r) => r.id === bot.roomId) ?? null;
  const roomProject = room?.project_id ? (projects.find((p) => p.id === room.project_id) ?? null) : null;

  const wake = async () => {
    const text = draft.trim();
    if (!agent || !text || busy) return;
    const effective =
      agent.project_path || !roomProject ? agent : { ...agent, project_path: roomProject.folder_path };
    const spec = agentSpawnSpec(effective);
    if ("error" in spec) {
      setError(spec.error);
      return;
    }
    setBusy(true);
    try {
      const provider = await useAgentsStore.getState().getSpawnProvider();
      if (!provider) {
        setError("No spawn-capable provider is available — is the engine running?");
        return;
      }
      const res = await commands.spawnSession(provider, { ...spec, prompt: text });
      if (res.status === "error") {
        setError(res.error);
        return;
      }
      // Binding makes the session "crew" (T18) and seats it in this room.
      await useBindingsStore.getState().upsert({
        session_id: res.data.id,
        agent_id: agent.id,
        room_id: bot.roomId === LOBBY_ID ? null : bot.roomId,
        display_name: null,
        pinned: false,
      });
      setDraft("");
      onSpawned?.(sessionKey(res.data));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SideShell
      title={
        <>
          {agent?.icon ? `${agent.icon} ` : "🤖 "}
          {bot.name}
        </>
      }
      onClose={onClose}
    >
      <p className="text-xs text-muted-foreground">
        {agent?.bio?.trim() || "Resting at headquarters — ready when you are."}
      </p>

      <SectionLabel>Wake up</SectionLabel>
      <div className="flex gap-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          // The world panel listens for F/E/Esc — typing must not reach it.
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") void wake();
          }}
          placeholder={`Wake ${bot.name} with a message…`}
          disabled={busy}
          className="h-7 min-w-0 flex-1 rounded border bg-background px-2 text-xs outline-none focus:border-primary"
        />
        <Button size="xs" onClick={() => void wake()} disabled={busy || !draft.trim()}>
          {busy ? "Waking…" : "Send"}
        </Button>
      </div>
      {!agent?.project_path && roomProject && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          Will work in {roomProject.icon ? `${roomProject.icon} ` : ""}
          {roomProject.name} (this room's project).
        </p>
      )}

      <SectionLabel>Crew</SectionLabel>
      <div className="flex flex-wrap gap-1.5">
        <Button
          size="xs"
          variant="outline"
          onClick={() => {
            openPanel("crew");
            onClose();
          }}
        >
          Manage crew
        </Button>
      </div>

      {error && (
        <div className="mt-3">
          <p className="text-xs text-destructive">{error}</p>
          <Button
            size="xs"
            variant="outline"
            className="mt-1.5"
            onClick={() => {
              // The agent editor lives in the crew panel (pencil on the card).
              openPanel("crew");
              onClose();
            }}
          >
            Open agent editor
          </Button>
        </div>
      )}
    </SideShell>
  );
}

export function RoomInfoCard({
  zone,
  bots,
  onClose,
  onImportBlueprint,
  onCreateProp,
  onSelectBot,
}: {
  zone: WorldZone;
  bots: WorldBot[];
  onClose: () => void;
  /** Opens the v1 blueprint paste-import for this room (EKI-81). */
  onImportBlueprint?: (() => void) | undefined;
  /** Opens creator mode for this room (EKI-83): dream up a prop with AI. */
  onCreateProp?: (() => void) | undefined;
  /** Selecting an occupant moves the world selection (camera follows). */
  onSelectBot?: ((bot: WorldBot) => void) | undefined;
}) {
  const [openTasks, setOpenTasks] = useState<number | null>(null);
  const projects = useProjectsStore((s) => s.projects);
  const rooms = useBindingsStore((s) => s.rooms);
  const room = rooms.find((r) => r.id === zone.id) ?? null;
  const project = room?.project_id ? (projects.find((p) => p.id === room.project_id) ?? null) : null;

  useEffect(() => {
    if (zone.id === LOBBY_ID) return;
    let stale = false;
    void commands.listTasks().then((res) => {
      if (stale || res.status !== "ok") return;
      setOpenTasks(res.data.filter((t) => t.room_id === zone.id && t.status !== "done").length);
    });
    return () => {
      stale = true;
    };
  }, [zone.id]);

  const working = bots.filter((b) => b.status === "Working").length;
  const waiting = bots.filter(
    (b) => b.status === "WaitingForPermission" || b.status === "WaitingForInput",
  ).length;
  const idle = bots.filter((b) => b.status === "Idle").length;

  return (
    <SideShell title={zone.isHq ? `★ ${zone.name}` : zone.name} onClose={onClose}>
      <SectionLabel>Room stats</SectionLabel>
      <StatRow label="Total agents" value={bots.length} />
      <StatRow label="Working" value={working} />
      <StatRow label="Needs you" value={waiting} />
      <StatRow label="Idle" value={idle} />
      {zone.id !== LOBBY_ID && openTasks !== null && <StatRow label="Open tasks" value={openTasks} />}

      {zone.id !== LOBBY_ID && (
        <>
          <SectionLabel>Project</SectionLabel>
          <p className="text-xs">
            {project ? (
              <>
                {project.icon ? `${project.icon} ` : ""}
                {project.name}
              </>
            ) : (
              <span className="text-muted-foreground">No project assigned</span>
            )}
          </p>
        </>
      )}

      <SectionLabel>Agents in room</SectionLabel>
      {bots.length > 0 ? (
        <ul className="space-y-1">
          {bots.map((b) => (
            <li key={b.key}>
              <button
                type="button"
                className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs hover:bg-muted"
                onClick={() => onSelectBot?.(b)}
              >
                <StatusEmoji status={b.status} />
                <span className="min-w-0 flex-1 truncate">{b.name}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {statusGlow(b.status).label}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Nobody home right now.</p>
      )}

      {zone.id !== LOBBY_ID && (onImportBlueprint || onCreateProp) && (
        <>
          <SectionLabel>Room</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {onCreateProp && (
              <Button size="xs" variant="outline" onClick={onCreateProp}>
                ✨ Dream up a prop
              </Button>
            )}
            {onImportBlueprint && (
              <Button size="xs" variant="outline" onClick={onImportBlueprint}>
                Import v1 blueprint
              </Button>
            )}
          </div>
        </>
      )}
    </SideShell>
  );
}

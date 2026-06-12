// DOM overlays for in-world clicks (EKI-71): bot quick actions and the room
// info card. Plain panels in the corner — no 3D-anchored popovers to fight.
// The bot card carries a mini chat (EKI-116) so a quick exchange never needs
// the workspace: transcript tail + live items + a send box.
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { openChatPanel } from "@/app/open-chat";
import { openPanel } from "@/app/palette-actions";
import { StatusEmoji } from "@/components/StatusEmoji";
import { Button } from "@/components/ui/button";
import { commands, type SeqItem } from "@/ipc/bindings";
import { onEngineEvent } from "@/ipc/events";
import { useAgentsStore } from "@/stores/agents";
import { sessionKey } from "@/stores/sessions";
import type { WorldBot } from "./lib/bots";
import { LOBBY_ID, type WorldZone } from "./lib/layout";
import { statusGlow } from "./lib/status";

function CardShell({
  title,
  onClose,
  children,
  className = "w-64",
}: {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`pointer-events-auto absolute right-2 top-2 z-10 rounded-md border bg-card/95 p-3 text-sm shadow-lg backdrop-blur ${className}`}
    >
      <div className="mb-2 flex items-center gap-2">
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
      {children}
    </div>
  );
}

interface ChatLine {
  who: "user" | "bot";
  text: string;
}

const CHAT_TAIL_FETCH = 80; // transcript items to pull (most are tool noise)
const CHAT_LINES_MAX = 12;
const CHAT_LINE_CHARS = 280;

function chatLine(who: ChatLine["who"], text: string): ChatLine | null {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  return { who, text: flat.length > CHAT_LINE_CHARS ? `${flat.slice(0, CHAT_LINE_CHARS - 1)}…` : flat };
}

function linesFromItems(items: SeqItem[]): ChatLine[] {
  const out: ChatLine[] = [];
  for (const { item } of items) {
    if (item.kind === "UserText") {
      const l = chatLine("user", item.data.text);
      if (l) out.push(l);
    } else if (item.kind === "AssistantText") {
      const l = chatLine("bot", item.data.text);
      if (l) out.push(l);
    }
  }
  return out.slice(-CHAT_LINES_MAX);
}

/**
 * Mini in-world conversation (EKI-116): tail on mount, live items after.
 * Callers must remount per bot (key={bot.key}) — state never crosses bots.
 */
function useBotChat(bot: WorldBot): { lines: ChatLine[]; push: (l: ChatLine | null) => void } {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const push = (l: ChatLine | null) => {
    if (l) setLines((prev) => [...prev, l].slice(-CHAT_LINES_MAX));
  };

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const probe = await commands.getSessionTranscript(bot.id, 0, 1);
        if (!live || probe.status !== "ok") return;
        const offset = Math.max(0, probe.data.total - CHAT_TAIL_FETCH);
        const page = await commands.getSessionTranscript(bot.id, offset, CHAT_TAIL_FETCH);
        if (!live || page.status !== "ok") return;
        setLines((prev) => (prev.length ? prev : linesFromItems(page.data.items)));
      } catch {
        // transcript unavailable — the input still works
      }
    })();

    let unlisten: (() => void) | null = null;
    onEngineEvent((ev) => {
      if (ev.type !== "Item" || sessionKey(ev.data.id) !== bot.key) return;
      const item = ev.data.item;
      if (item.kind === "AssistantText") push(chatLine("bot", item.data.text));
      else if (item.kind === "UserText") push(chatLine("user", item.data.text));
    })
      .then((un) => {
        if (live) unlisten = un;
        else un();
      })
      .catch(() => undefined);

    return () => {
      live = false;
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bot.key covers bot.id
  }, [bot.key]);

  return { lines, push };
}

export function BotActionsCard({ bot, onClose }: { bot: WorldBot; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [confirmKill, setConfirmKill] = useState(false);
  const [draft, setDraft] = useState("");
  const { lines, push } = useBotChat(bot);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const run = async (p: Promise<{ status: "ok" } | { status: "error"; error: string }>) => {
    const res = await p;
    if (res.status === "error") setError(res.error);
  };

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    push(chatLine("user", text));
    void run(commands.sendToSession(bot.id, text));
  };

  return (
    <CardShell
      title={
        <>
          <StatusEmoji status={bot.status} className="mr-1" /> {bot.name}
        </>
      }
      onClose={onClose}
      className="w-80"
    >
      <p className="mb-2 truncate text-xs text-muted-foreground">
        {statusGlow(bot.status).label}
        {bot.activity ? ` — ${bot.activity}` : ""}
      </p>

      {/* Mini chat (EKI-116) — quick exchanges without leaving the world */}
      {lines.length > 0 && (
        <div ref={scroller} className="mb-2 flex max-h-44 flex-col gap-1 overflow-y-auto pr-0.5">
          {lines.map((l, i) => (
            <div
              key={i}
              className={
                l.who === "bot"
                  ? "max-w-[85%] self-start rounded-lg rounded-bl-sm bg-muted px-2 py-1 text-xs"
                  : "max-w-[85%] self-end rounded-lg rounded-br-sm bg-primary/15 px-2 py-1 text-xs"
              }
            >
              {l.text}
            </div>
          ))}
        </div>
      )}
      <div className="mb-2 flex gap-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          // The world panel listens for F/E/Esc — typing must not reach it.
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") send();
          }}
          placeholder={`Message ${bot.name}…`}
          className="h-7 min-w-0 flex-1 rounded border bg-background px-2 text-xs outline-none focus:border-primary"
        />
        <Button size="xs" onClick={send} disabled={!draft.trim()}>
          Send
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
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
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </CardShell>
  );
}

/**
 * Crew member resting at HQ (EKI-110): there is no session behind this bot,
 * so no session actions — just who they are and the door to the crew panel.
 */
export function CrewRestCard({ bot, onClose }: { bot: WorldBot; onClose: () => void }) {
  const agent = useAgentsStore((s) => s.agents.find((a) => a.id === bot.agentId));
  return (
    <CardShell
      title={
        <>
          {agent?.icon ? `${agent.icon} ` : "🤖 "}
          {bot.name}
        </>
      }
      onClose={onClose}
    >
      <p className="mb-2 text-xs text-muted-foreground">
        {agent?.bio?.trim() || "Resting at headquarters — ready when you are."}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <Button
          size="xs"
          onClick={() => {
            openPanel("crew");
            onClose();
          }}
        >
          Manage crew
        </Button>
      </div>
    </CardShell>
  );
}

export function RoomInfoCard({
  zone,
  bots,
  onClose,
  onImportBlueprint,
  onCreateProp,
}: {
  zone: WorldZone;
  bots: WorldBot[];
  onClose: () => void;
  /** Opens the v1 blueprint paste-import for this room (EKI-81). */
  onImportBlueprint?: (() => void) | undefined;
  /** Opens creator mode for this room (EKI-83): dream up a prop with AI. */
  onCreateProp?: (() => void) | undefined;
}) {
  const [openTasks, setOpenTasks] = useState<number | null>(null);

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

  return (
    <CardShell title={zone.isHq ? `★ ${zone.name}` : zone.name} onClose={onClose}>
      <p className="mb-2 text-xs text-muted-foreground">
        {bots.length} session{bots.length === 1 ? "" : "s"}
        {zone.id !== LOBBY_ID && openTasks !== null && (
          <>
            {" · "}
            {openTasks} open task{openTasks === 1 ? "" : "s"}
          </>
        )}
      </p>
      {bots.length > 0 ? (
        <ul className="max-h-40 space-y-1 overflow-auto">
          {bots.map((b) => (
            <li key={b.key} className="flex items-center gap-1.5 text-xs">
              <StatusEmoji status={b.status} />
              <button
                type="button"
                className="min-w-0 truncate text-left hover:underline"
                onClick={() => {
                  openChatPanel({ provider: b.id.provider, id: b.id.id });
                  onClose();
                }}
              >
                {b.name}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Nobody home right now.</p>
      )}
      {zone.id !== LOBBY_ID && (onImportBlueprint || onCreateProp) && (
        <div className="mt-2 flex gap-1.5 border-t pt-2">
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
      )}
    </CardShell>
  );
}

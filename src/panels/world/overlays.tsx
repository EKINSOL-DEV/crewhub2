// DOM overlays for in-world clicks (EKI-71): bot quick actions and the room
// info card. Plain panels in the corner — no 3D-anchored popovers to fight.
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { openChatPanel } from "@/app/open-chat";
import { StatusEmoji } from "@/components/StatusEmoji";
import { Button } from "@/components/ui/button";
import { commands } from "@/ipc/bindings";
import type { WorldBot } from "./lib/bots";
import { LOBBY_ID, type WorldZone } from "./lib/layout";
import { statusGlow } from "./lib/status";

function CardShell({
  title,
  onClose,
  children,
}: {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="pointer-events-auto absolute right-2 top-2 z-10 w-64 rounded-md border bg-card/95 p-3 text-sm shadow-lg backdrop-blur">
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

export function BotActionsCard({ bot, onClose }: { bot: WorldBot; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [confirmKill, setConfirmKill] = useState(false);

  const run = async (p: Promise<{ status: "ok" } | { status: "error"; error: string }>) => {
    const res = await p;
    if (res.status === "error") setError(res.error);
  };

  return (
    <CardShell
      title={
        <>
          <StatusEmoji status={bot.status} className="mr-1" /> {bot.name}
        </>
      }
      onClose={onClose}
    >
      <p className="mb-2 truncate text-xs text-muted-foreground">
        {statusGlow(bot.status).label}
        {bot.activity ? ` — ${bot.activity}` : ""}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <Button
          size="xs"
          onClick={() => {
            openChatPanel({ provider: bot.id.provider, id: bot.id.id });
            onClose();
          }}
        >
          Open chat
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

export function RoomInfoCard({
  zone,
  bots,
  onClose,
}: {
  zone: WorldZone;
  bots: WorldBot[];
  onClose: () => void;
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
    </CardShell>
  );
}

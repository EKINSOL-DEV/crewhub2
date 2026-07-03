// HQ card (M6 T4): clicking the headquarters building itself (normal mode,
// same gesture as a RoomCard) opens this instead of RoomCard — HQ isn't a
// plot and has no project to link, so there's no picker here, just the
// whole crew roster plus the same three shortcuts as HqProps' prop stands
// (so a player who never spots the tiny furniture can still reach them).
// HTML overlay like RoomCard/HireDialog — this is UI chrome, not campus
// geometry.
import { useEffect, useMemo, useState } from "react";
import { openWorkspaceWindow } from "@/game/app/windows";
import { playSfx } from "@/game/audio/sfx";
import { useBuildMode } from "@/game/build/mode";
import { BULB } from "@/game/characters/Characters";
import { normalizeFolder, toCharacters } from "@/game/sim/characters";
import { useAgentsStore } from "@/stores/agents";
import { useProjectsStore } from "@/stores/projects";
import { useSessionsView } from "@/stores/sessions";

export function HqCard({ onClose }: { onClose: () => void }) {
  const openRoomCard = useBuildMode((s) => s.openRoomCard);
  const agents = useAgentsStore((s) => s.agents);
  const projects = useProjectsStore((s) => s.projects);
  const views = useSessionsView();
  // Captured once at mount — same convention as RoomCard/HireDialog: the
  // card is short-lived, so a little drift in "who's active" while it's
  // open is fine and keeps render pure.
  const [nowMs] = useState(() => Date.now());

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Same join RoomCard uses for its narrower "who's in this room" list —
  // here every character qualifies, not just those in one linked project.
  const characters = useMemo(() => toCharacters(views, { agents, nowMs }), [views, agents, nowMs]);

  const projectNameByFolder = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) map.set(normalizeFolder(p.folder_path), p.name);
    return map;
  }, [projects]);

  const openWorkspace = () => {
    onClose();
    openWorkspaceWindow();
    playSfx("click");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        data-testid="hq-card"
        className="flex max-h-[80vh] w-[360px] flex-col rounded-3xl border-2 border-white/60 bg-white/90 text-slate-900 shadow-2xl backdrop-blur"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 rounded-t-3xl border-b-2 border-slate-900/10 px-4 py-3">
          <span className="flex-1 font-bold">🏛 Headquarters</span>
          <button
            type="button"
            aria-label="Close"
            className="rounded-full px-1.5 py-0.5 font-bold hover:bg-slate-900/10"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-3 p-3">
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-500 uppercase">Crew</div>
            <ul className="flex max-h-52 flex-col gap-1 overflow-y-auto" data-testid="hq-card-roster">
              {characters.length === 0 && <li className="text-sm text-slate-500">No crew yet.</li>}
              {characters.map((c) => {
                const projectName = c.projectPath ? projectNameByFolder.get(c.projectPath) : undefined;
                return (
                  <li
                    key={c.key}
                    data-testid={`hq-card-roster-${c.key}`}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    {projectName && (
                      <span className="shrink-0 truncate text-xs text-slate-500">{projectName}</span>
                    )}
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: BULB[c.status] }}
                    />
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex flex-col gap-2 border-t-2 border-slate-900/10 pt-3">
            <button
              type="button"
              data-testid="hq-card-projects"
              onClick={() => openRoomCard({ kind: "projects" })}
              className="rounded-full border-2 border-slate-900/10 px-3 py-1.5 text-left text-sm hover:bg-slate-900/5"
            >
              📋 Projects
            </button>
            <button
              type="button"
              data-testid="hq-card-hire"
              onClick={() => openRoomCard({ kind: "hire" })}
              className="rounded-full border-2 border-slate-900/10 px-3 py-1.5 text-left text-sm hover:bg-slate-900/5"
            >
              👥 Hire crew
            </button>
            <button
              type="button"
              data-testid="hq-card-workspace"
              onClick={openWorkspace}
              className="rounded-full border-2 border-slate-900/10 px-3 py-1.5 text-left text-sm hover:bg-slate-900/5"
            >
              🧰 Workspace
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

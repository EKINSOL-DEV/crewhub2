// Room card (M5 T4): click a pavilion (base plot or player-built) outside
// build mode to see/change what project it's linked to and who's working
// there right now. HTML overlay like HireDialog/RoomLinkDialog — this is UI
// chrome, not campus geometry, so it floats over the canvas rather than
// living in it (RoofPlate is the in-canvas nameplate; this is the
// interactive follow-up opened by clicking that same pavilion).
//
// Docked side panel (side-panel conversion), not a centered modal — see
// GamePanel's own header comment. Closing is ✕ or Escape now; there's no
// backdrop left to click.
import { useEffect, useMemo, useState } from "react";
import type { RoomCardTarget } from "@/game/build/mode";
import { useCampusEdits } from "@/game/build/store";
import { BULB } from "@/game/characters/Characters";
import { playSfx } from "@/game/audio/sfx";
import { ExitZoomButton, GamePanel } from "@/game/hud/GamePanel";
import { normalizeFolder, toCharacters } from "@/game/sim/characters";
import { useAgentsStore } from "@/stores/agents";
import { useProjectsStore } from "@/stores/projects";
import { useSessionsView } from "@/stores/sessions";

const FALLBACK_COLOR = "#94a3b8";
const FALLBACK_ICON = "📁";

export function RoomCard({ target, onClose }: { target: RoomCardTarget; onClose: () => void }) {
  const edits = useCampusEdits((s) => s.edits);
  const setPlotProject = useCampusEdits((s) => s.setPlotProject);
  const setBuildingProject = useCampusEdits((s) => s.setBuildingProject);
  const projects = useProjectsStore((s) => s.projects);
  const views = useSessionsView();
  const agents = useAgentsStore((s) => s.agents);
  // Captured once at mount — same convention as HireDialog: the card is
  // short-lived, so a little drift in "who's active" while it's open is fine
  // and keeps render pure.
  const [nowMs] = useState(() => Date.now());

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const currentProjectId =
    target.kind === "plot"
      ? (edits.plotProjects[target.plotIndex] ?? null)
      : (edits.buildings.find((b) => b.id === target.id)?.projectId ?? null);
  const currentProject = projects.find((p) => p.id === currentProjectId) ?? null;

  // Same join use-sim.ts drives the sim off (toCharacters() normalizes every
  // character's projectPath) — matching that same normalized folder against
  // the linked project's folder is exactly the rule that decides who the sim
  // actually seats in this room, so the card can't drift from what players
  // see walking around.
  const characters = useMemo(() => toCharacters(views, { agents, nowMs }), [views, agents, nowMs]);
  const bots = useMemo(() => {
    if (!currentProject) return [];
    const folder = normalizeFolder(currentProject.folder_path);
    return characters.filter((c) => c.projectPath && normalizeFolder(c.projectPath) === folder);
  }, [characters, currentProject]);

  const pick = (projectId: string | null) => {
    if (target.kind === "plot") setPlotProject(target.plotIndex, projectId);
    else setBuildingProject(target.id, projectId);
    playSfx("click");
  };

  return (
    <GamePanel
      title={<span className="flex-1 font-bold">🏷️ Room</span>}
      onClose={onClose}
      headerAction={<ExitZoomButton />}
    >
      <div data-testid="room-card" className="flex flex-col gap-3 p-3">
        <div
          data-testid="room-card-current"
          className="flex items-center gap-2 rounded-lg bg-slate-900/5 px-3 py-2 text-sm"
        >
          {currentProject ? (
            <>
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: currentProject.color ?? FALLBACK_COLOR }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {currentProject.icon ?? FALLBACK_ICON} {currentProject.name}
                </span>
                <span className="block truncate text-xs text-slate-500">{currentProject.folder_path}</span>
              </span>
            </>
          ) : (
            <span className="text-slate-500">Unassigned</span>
          )}
        </div>

        <div>
          <div className="mb-1 text-xs font-semibold text-slate-500 uppercase">Crew here</div>
          <ul className="flex flex-col gap-1" data-testid="room-card-bots">
            {bots.length === 0 && <li className="text-sm text-slate-500">No bots here yet.</li>}
            {bots.map((c) => (
              <li
                key={c.key}
                data-testid={`room-card-bot-${c.key}`}
                className="flex items-center gap-2 text-sm"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: BULB[c.status] }}
                />
                {c.name}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="mb-1 text-xs font-semibold text-slate-500 uppercase">Assign to</div>
          <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto" data-testid="room-card-project-list">
            {projects.map((project) => (
              <li key={project.id}>
                <button
                  type="button"
                  data-testid={`room-card-project-${project.id}`}
                  onClick={() => pick(project.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${
                    currentProjectId === project.id ? "bg-slate-900/10 font-medium" : "hover:bg-slate-900/5"
                  }`}
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: project.color ?? FALLBACK_COLOR }}
                  />
                  {project.icon ?? FALLBACK_ICON} {project.name}
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                data-testid="room-card-none"
                onClick={() => pick(null)}
                className="w-full rounded-full border-2 border-slate-900/10 px-3 py-1.5 text-left text-sm hover:bg-slate-900/5"
              >
                No project
              </button>
            </li>
          </ul>
        </div>
      </div>
    </GamePanel>
  );
}

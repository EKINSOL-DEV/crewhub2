// Room-link prompt (M3 T5, project-based M5 T4): shown right after a
// building is placed, mounted by GameShell whenever mode.ts's
// `pendingRoomLink` is set. Restyled per HireDialog/ChatWindow's chunky
// white/slate game-card look — a centered Card over a blurred backdrop, DOM
// not three.js (this is UI chrome, not campus geometry). Picking a project
// (or "No project") writes `projectId` onto the building via the edits
// store, which PlacedBuildings reads for both the slab-edge tint and the
// roof nameplate; skipping leaves it null, a fully valid state.
import { useEffect } from "react";
import { playSfx } from "@/game/audio/sfx";
import { useProjectsStore } from "@/stores/projects";
import { useCampusEdits } from "./store";

const FALLBACK_COLOR = "#94a3b8";
const FALLBACK_ICON = "📁";

export function RoomLinkDialog({ buildingId, onClose }: { buildingId: string; onClose: () => void }) {
  const projects = useProjectsStore((s) => s.projects);
  const setBuildingProject = useCampusEdits((s) => s.setBuildingProject);

  // Escape skips, same convention as HireDialog's backdrop click and
  // BuildControls' own Escape handling — this dialog floats over the canvas
  // for a beat, it shouldn't trap the player.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const pick = (projectId: string | null) => {
    setBuildingProject(buildingId, projectId);
    playSfx("click");
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        data-testid="room-link-dialog"
        className="flex w-[320px] flex-col gap-2 rounded-3xl border-2 border-white/60 bg-white/90 p-4 text-slate-900 shadow-2xl backdrop-blur"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-bold">🏷️ Link a project?</div>
        <ul className="flex max-h-60 flex-col gap-1 overflow-y-auto" data-testid="room-link-list">
          {projects.length === 0 && <li className="text-sm text-slate-500">No projects yet.</li>}
          {projects.map((project) => (
            <li key={project.id}>
              <button
                type="button"
                data-testid={`room-link-project-${project.id}`}
                onClick={() => pick(project.id)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-900/5"
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: project.color ?? FALLBACK_COLOR }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {project.icon ?? FALLBACK_ICON} {project.name}
                  </span>
                  <span className="block truncate text-xs text-slate-500">{project.folder_path}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          data-testid="room-link-none"
          onClick={() => pick(null)}
          className="self-start rounded-full border-2 border-slate-900/10 px-3 py-1.5 text-sm hover:bg-slate-900/5"
        >
          No project
        </button>
      </div>
    </div>
  );
}

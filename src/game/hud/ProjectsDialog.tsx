// In-game Projects dialog (M6 T4): HQ's 📋 prop stand and HqCard shortcut
// both open this — same HireDialog-styled overlay, but manages the
// projects themselves (create/rename/recolor/re-point folder/delete). Room
// linking stays in RoomCard/RoomLinkDialog; this dialog never touches
// plotProjects/buildingProject.
//
// Deliberately not src/panels/projects/ProjectForm.tsx (out of scope, and
// that form's folder field goes through the native pick_folder IPC dialog,
// which the game shell has no window chrome to host) — folder path is a
// plain text input here instead. Create/update/delete go through
// useProjectsStore's own methods (stores/projects.ts), which already wrap
// the commands.*Project calls with the store's refresh()-on-success and
// try/catch-to-ProjectResult error normalization — reimplementing that
// here would just be a second copy of the same logic.
import { useEffect, useState } from "react";
import { playSfx } from "@/game/audio/sfx";
import type { Project } from "@/ipc/bindings";
import { useProjectsStore } from "@/stores/projects";

const FALLBACK_COLOR = "#94a3b8";
const DEFAULT_ICON = "📁";
const COLOR_PRESETS = ["#7aa2f7", "#22c55e", "#f59e0b", "#f43f5e", "#a78bfa", "#06b6d4"];

type View = { kind: "list" } | { kind: "create" } | { kind: "edit"; project: Project };

interface FormInput {
  name: string;
  folder_path: string;
  color: string;
}

export function ProjectsDialog({ onClose }: { onClose: () => void }) {
  const projects = useProjectsStore((s) => s.projects);
  const [view, setView] = useState<View>({ kind: "list" });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const save = async (input: FormInput, editing: Project | null) => {
    setBusy(true);
    setError(null);
    const res = editing
      ? await useProjectsStore.getState().update({ ...editing, ...input })
      : await useProjectsStore.getState().create({
          name: input.name,
          description: null,
          icon: DEFAULT_ICON,
          color: input.color,
          folder_path: input.folder_path,
          docs_path: null,
        });
    setBusy(false);
    if (res.status === "error") {
      setError(res.error);
      return;
    }
    playSfx(editing ? "click" : "place");
    setView({ kind: "list" });
  };

  const remove = async (id: string) => {
    setBusy(true);
    setError(null);
    const err = await useProjectsStore.getState().remove(id);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    playSfx("click");
    setConfirmDeleteId(null);
  };

  const confirmTarget = confirmDeleteId ? (projects.find((p) => p.id === confirmDeleteId) ?? null) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        data-testid="projects-dialog"
        className="flex max-h-[80vh] w-[400px] flex-col rounded-3xl border-2 border-white/60 bg-white/90 text-slate-900 shadow-2xl backdrop-blur"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 rounded-t-3xl border-b-2 border-slate-900/10 px-4 py-3">
          <span className="flex-1 font-bold">📋 Projects</span>
          {view.kind === "list" && (
            <button
              type="button"
              aria-label="New project"
              data-testid="projects-dialog-create"
              className="rounded-full px-2 py-0.5 text-sm font-bold hover:bg-slate-900/10"
              onClick={() => setView({ kind: "create" })}
            >
              ➕
            </button>
          )}
          <button
            type="button"
            aria-label="Close"
            className="rounded-full px-1.5 py-0.5 font-bold hover:bg-slate-900/10"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {error && (
          <div
            className="mx-3 mt-2 rounded-lg bg-red-100 px-3 py-1.5 text-xs text-red-700"
            data-testid="projects-dialog-error"
          >
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3">
          {view.kind === "list" && (
            <ul className="flex flex-col gap-1" data-testid="projects-dialog-list">
              {projects.length === 0 && <li className="text-sm text-slate-500">No projects yet.</li>}
              {projects.map((p) => (
                <li
                  key={p.id}
                  data-testid={`projects-dialog-project-${p.id}`}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm"
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: p.color ?? FALLBACK_COLOR }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {p.icon ?? DEFAULT_ICON} {p.name}
                    </span>
                    <span className="block truncate text-xs text-slate-500">{p.folder_path}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-slate-900/10 px-2 py-0.5 text-[10px] uppercase">
                    {p.status}
                  </span>
                  <button
                    type="button"
                    aria-label={`Edit ${p.name}`}
                    data-testid={`projects-dialog-edit-${p.id}`}
                    className="rounded-full px-1.5 py-0.5 hover:bg-slate-900/10"
                    onClick={() => setView({ kind: "edit", project: p })}
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${p.name}`}
                    data-testid={`projects-dialog-delete-${p.id}`}
                    className="rounded-full px-1.5 py-0.5 hover:bg-slate-900/10"
                    onClick={() => setConfirmDeleteId(p.id)}
                  >
                    🗑
                  </button>
                </li>
              ))}
            </ul>
          )}

          {confirmTarget && (
            <div
              data-testid="projects-dialog-confirm-delete"
              className="mt-2 rounded-lg border-2 border-red-400/50 bg-red-50 p-2 text-xs"
            >
              <p>
                Delete <strong>{confirmTarget.name}</strong>? Its rooms and tasks go with it (the folder on
                disk is untouched).
              </p>
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  data-testid="projects-dialog-confirm-delete-yes"
                  disabled={busy}
                  className="rounded-full bg-red-600 px-2.5 py-1 font-medium text-white disabled:opacity-50"
                  onClick={() => void remove(confirmTarget.id)}
                >
                  Delete it
                </button>
                <button
                  type="button"
                  data-testid="projects-dialog-confirm-delete-no"
                  className="rounded-full border border-slate-900/10 px-2.5 py-1 hover:bg-slate-900/5"
                  onClick={() => setConfirmDeleteId(null)}
                >
                  Keep it
                </button>
              </div>
            </div>
          )}

          {(view.kind === "create" || view.kind === "edit") && (
            <ProjectFields
              key={view.kind === "edit" ? view.project.id : "new"}
              project={view.kind === "edit" ? view.project : null}
              busy={busy}
              onCancel={() => setView({ kind: "list" })}
              onSave={(input) => void save(input, view.kind === "edit" ? view.project : null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** Create/edit fields, shared by both flows — `project` null means "new".
 *  Keyed by the parent so switching which project is being edited (or
 *  from edit back to create) always remounts fresh, same convention
 *  HireDialog's HireForm uses for switching agents. */
function ProjectFields({
  project,
  busy,
  onCancel,
  onSave,
}: {
  project: Project | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (input: FormInput) => void;
}) {
  const [name, setName] = useState(project?.name ?? "");
  const [folderPath, setFolderPath] = useState(project?.folder_path ?? "");
  const [color, setColor] = useState(project?.color ?? COLOR_PRESETS[0]!);

  const canSave = name.trim().length > 0 && folderPath.trim().length > 0;

  return (
    <div
      data-testid="projects-dialog-form"
      className="mt-2 flex flex-col gap-2 rounded-lg border-2 border-slate-900/10 p-2"
    >
      <h4 className="text-sm font-semibold">{project ? `Edit ${project.name}` : "New project"}</h4>
      <input
        aria-label="Project name"
        data-testid="projects-dialog-form-name"
        placeholder="Name"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-8 rounded-full border-2 border-slate-900/10 bg-white px-3 text-sm outline-none"
      />
      <input
        aria-label="Project folder"
        data-testid="projects-dialog-form-folder"
        placeholder="/path/to/folder"
        value={folderPath}
        onChange={(e) => setFolderPath(e.target.value)}
        className="h-8 rounded-full border-2 border-slate-900/10 bg-white px-3 font-mono text-xs outline-none"
      />
      <div className="flex items-center gap-1">
        {COLOR_PRESETS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Color ${c}`}
            data-testid={`projects-dialog-form-color-${c}`}
            onClick={() => setColor(c)}
            className={`h-5 w-5 shrink-0 rounded-full ${color === c ? "ring-2 ring-slate-900 ring-offset-1" : ""}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          data-testid="projects-dialog-form-save"
          disabled={!canSave || busy}
          onClick={() => onSave({ name: name.trim(), folder_path: folderPath.trim(), color })}
          className="rounded-full border-2 border-white/60 bg-emerald-700/90 px-4 py-1.5 text-sm font-bold text-white shadow disabled:opacity-50"
        >
          {busy ? "…" : "Save"}
        </button>
        <button
          type="button"
          data-testid="projects-dialog-form-cancel"
          onClick={onCancel}
          className="rounded-full px-3 py-1.5 text-sm hover:bg-slate-900/5"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

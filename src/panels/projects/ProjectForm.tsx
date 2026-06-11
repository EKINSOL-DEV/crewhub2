// Project create/edit form (M3 T7, EKI-85). Folder selection goes through the
// native picker ONLY (pick_folder, Rust-side dialog — D-M3-7): there is no
// typed-path input, and the backend still validates + extends PathPolicy on
// registration, so an invalid pick degrades to a friendly error here.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { commands, type Project } from "@/ipc/bindings";
import { dirName, useProjectsStore } from "@/stores/projects";

const QUICK_ICONS = ["📁", "🗺️", "🚀", "🧪", "🛠️", "📦", "🌱", "🎨"];

export function ProjectForm({
  project,
  initialFolder,
  onClose,
}: {
  /** null = registering a new project. */
  project?: Project | null;
  /** Pre-picked folder (auto-suggest one-click register, EKI-85). */
  initialFolder?: string | null;
  onClose: () => void;
}) {
  const { create, update } = useProjectsStore();
  const [name, setName] = useState(project?.name ?? (initialFolder ? dirName(initialFolder) : ""));
  const [description, setDescription] = useState(project?.description ?? "");
  const [icon, setIcon] = useState(project?.icon ?? "📁");
  const [color, setColor] = useState(project?.color ?? "#7aa2f7");
  const [folderPath, setFolderPath] = useState(project?.folder_path ?? initialFolder ?? "");
  const [docsPath, setDocsPath] = useState(project?.docs_path ?? "");
  const [archived, setArchived] = useState(project?.status === "archived");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (target: "folder" | "docs") => {
    setError(null);
    try {
      const res = await commands.pickFolder();
      if (res.status === "error") {
        setError(`The folder picker had a moment: ${res.error}`);
        return;
      }
      if (res.data === null) return; // user cancelled — not an error
      if (target === "folder") {
        setFolderPath(res.data);
        if (!name.trim()) setName(dirName(res.data));
      } else {
        setDocsPath(res.data);
      }
    } catch (e) {
      setError(`The folder picker had a moment: ${String(e)}`);
    }
  };

  const save = async () => {
    if (!name.trim() || !folderPath) return;
    setBusy(true);
    setError(null);
    const core = {
      name: name.trim(),
      description: description.trim() || null,
      icon,
      color,
      folder_path: folderPath,
      docs_path: docsPath || null,
    };
    const res = project
      ? await update({ ...project, ...core, status: archived ? "archived" : "active" })
      : await create(core);
    setBusy(false);
    if (res.status === "error") {
      // Path-policy / not-a-directory rejections land here (EKI-85 AC).
      setError(`That folder didn't work out: ${res.error}`);
      return;
    }
    onClose();
  };

  return (
    <div data-testid="project-form" className="flex flex-col gap-3 rounded border p-3">
      <h3 className="text-sm font-semibold">{project ? `Edit ${project.name}` : "Register a project"}</h3>

      <label className="flex items-center gap-2 text-xs">
        <span className="w-24 shrink-0 text-muted-foreground">Folder</span>
        <span
          data-testid="picked-folder"
          className="flex-1 truncate rounded border bg-card px-2 py-1 font-mono text-xs"
          title={folderPath || "No folder picked yet"}
        >
          {folderPath || "— pick the project folder —"}
        </span>
        <Button size="xs" variant="outline" onClick={() => void pick("folder")}>
          Pick folder…
        </Button>
      </label>

      <label className="flex items-center gap-2 text-xs">
        <span className="w-24 shrink-0 text-muted-foreground">Name</span>
        <input
          aria-label="Project name"
          autoFocus
          className="flex-1 rounded border bg-card px-2 py-1 text-sm"
          placeholder="defaults to the folder name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <label className="flex items-center gap-2 text-xs">
        <span className="w-24 shrink-0 text-muted-foreground">Description</span>
        <input
          aria-label="Project description"
          className="flex-1 rounded border bg-card px-2 py-1 text-sm"
          placeholder="what lives here?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      <label className="flex items-center gap-2 text-xs">
        <span className="w-24 shrink-0 text-muted-foreground">Face</span>
        <input
          aria-label="Project icon"
          className="w-14 rounded border bg-card px-2 py-1 text-center text-sm"
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
        />
        <span className="flex gap-1">
          {QUICK_ICONS.map((i) => (
            <button
              key={i}
              type="button"
              className="rounded px-1 hover:bg-accent/20"
              onClick={() => setIcon(i)}
            >
              {i}
            </button>
          ))}
        </span>
        <input
          aria-label="Project color"
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />
      </label>

      <div className="flex items-center gap-2 text-xs">
        <span className="w-24 shrink-0 text-muted-foreground">Docs</span>
        <span
          data-testid="picked-docs"
          className="flex-1 truncate rounded border bg-card px-2 py-1 font-mono text-xs"
          title={docsPath || "Optional — where the docs panel reads markdown from"}
        >
          {docsPath || "— optional docs folder —"}
        </span>
        <Button size="xs" variant="outline" onClick={() => void pick("docs")}>
          Pick docs…
        </Button>
        {docsPath && (
          <Button size="xs" variant="ghost" onClick={() => setDocsPath("")}>
            Clear
          </Button>
        )}
      </div>
      <p className="pl-26 text-[10px] text-muted-foreground">
        Tip: usually the <code>docs/</code> folder inside the project — leave empty to read from the project
        root.
      </p>

      {project && (
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
          Archived (tucked away, never deleted)
        </label>
      )}

      <div className="flex items-center gap-2 border-t pt-2">
        <Button size="sm" disabled={!name.trim() || !folderPath || busy} onClick={() => void save()}>
          {project ? "Save" : "Register 🗺️"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
      {error && (
        <p data-testid="project-form-error" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

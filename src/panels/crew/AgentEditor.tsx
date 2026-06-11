// Agent editor (T19, EKI-32): full agent CRUD form + persona composer +
// CLAUDE.md materialization. BypassPermissions sits behind an explicit
// warning gate (master plan §5.5).
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { commands, type Agent, type Project } from "@/ipc/bindings";
import { useAgentsStore } from "@/stores/agents";
import { ModelSelect, DEFAULT_MODEL } from "./ModelSelect";
import { PersonaComposer } from "./PersonaComposer";
import { composeSystemPrompt, defaultPersona, parsePersona, serializePersona } from "./persona";

const QUICK_ICONS = ["🧑‍🚀", "🤖", "🦊", "🐙", "🔭", "🛠️", "🦉", "🐝"];
const PERMISSION_MODES = ["Default", "AcceptEdits", "Plan", "BypassPermissions"] as const;

export function AgentEditor({
  agent,
  onClose,
  onSaved,
}: {
  /** null/undefined = hiring a new agent. */
  agent?: Agent | null;
  onClose: () => void;
  onSaved?: (saved: Agent, created: boolean) => void;
}) {
  const { create, update } = useAgentsStore();
  const [name, setName] = useState(agent?.name ?? "");
  const [icon, setIcon] = useState(agent?.icon ?? "🧑‍🚀");
  const [color, setColor] = useState(agent?.color ?? "#7aa2f7");
  const [projectPath, setProjectPath] = useState(agent?.project_path ?? "");
  const [model, setModel] = useState(agent?.default_model ?? DEFAULT_MODEL); // haiku-default (D-M2-7)
  const [permissionMode, setPermissionMode] = useState(agent?.permission_mode ?? "Default");
  const [bypassConfirmed, setBypassConfirmed] = useState(false);
  const [pinned, setPinned] = useState(agent?.is_pinned ?? true);
  const [autoSpawn, setAutoSpawn] = useState(agent?.auto_spawn ?? false);
  const [persona, setPersona] = useState(() => parsePersona(agent?.persona_json ?? null) ?? defaultPersona());
  const [projects, setProjects] = useState<Project[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [materializeNote, setMaterializeNote] = useState<string | null>(null);

  useEffect(() => {
    commands
      .listProjects()
      .then((res) => {
        if (res.status === "ok" && Array.isArray(res.data)) setProjects(res.data);
      })
      .catch(() => setProjects([]));
  }, []);

  const selectedProject = useMemo(
    () => projects.find((p) => p.folder_path === projectPath) ?? null,
    [projects, projectPath],
  );
  const needsBypassConfirm = permissionMode === "BypassPermissions" && !bypassConfirmed;
  const systemPrompt = composeSystemPrompt(name, persona);

  const save = async () => {
    if (!name.trim() || needsBypassConfirm) return;
    setBusy(true);
    setError(null);
    const core = {
      name: name.trim(),
      icon,
      color,
      default_model: model,
      project_path: projectPath || null,
      permission_mode: permissionMode,
      system_prompt: systemPrompt,
    };
    const res = agent
      ? await update({
          ...agent,
          ...core,
          persona_json: serializePersona(persona),
          is_pinned: pinned,
          auto_spawn: autoSpawn,
        })
      : await create(core, {
          persona_json: serializePersona(persona),
          is_pinned: pinned,
          auto_spawn: autoSpawn,
        });
    setBusy(false);
    if (res.status === "error") {
      setError(res.error);
      return;
    }
    onSaved?.(res.data, !agent);
    onClose();
  };

  const materialize = async (remove: boolean) => {
    if (!selectedProject) return;
    setMaterializeNote(null);
    const res = remove
      ? await commands.removeMaterializedPersona(selectedProject.id)
      : await commands.materializePersona(selectedProject.id, systemPrompt);
    setMaterializeNote(
      res.status === "ok"
        ? remove
          ? "Removed the crewhub persona block from CLAUDE.md."
          : "Persona written into the project's CLAUDE.md (fenced crewhub block)."
        : `CLAUDE.md update failed: ${res.error}`,
    );
  };

  return (
    <div data-testid="agent-editor" className="flex flex-col gap-3 rounded border p-3">
      <h3 className="text-sm font-semibold">{agent ? `Edit ${agent.name}` : "Hire an agent"}</h3>

      <label className="flex items-center gap-2 text-xs">
        <span className="w-24 shrink-0 text-muted-foreground">Name</span>
        <input
          aria-label="Agent name"
          autoFocus
          className="flex-1 rounded border bg-card px-2 py-1 text-sm"
          placeholder="e.g. Scout"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <label className="flex items-center gap-2 text-xs">
        <span className="w-24 shrink-0 text-muted-foreground">Face</span>
        <input
          aria-label="Agent icon"
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
          aria-label="Agent color"
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />
      </label>

      <label className="flex items-center gap-2 text-xs">
        <span className="w-24 shrink-0 text-muted-foreground">Project</span>
        <select
          aria-label="Project"
          className="flex-1 rounded border bg-card px-2 py-1 text-sm"
          value={projectPath}
          onChange={(e) => setProjectPath(e.target.value)}
        >
          <option value="">— no home project —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.folder_path}>
              {p.name} ({p.folder_path})
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-xs">
        <span className="w-24 shrink-0 text-muted-foreground">Model</span>
        <ModelSelect value={model} onChange={setModel} />
      </label>

      <label className="flex items-center gap-2 text-xs">
        <span className="w-24 shrink-0 text-muted-foreground">Permissions</span>
        <select
          aria-label="Permission mode"
          className="rounded border bg-card px-2 py-1 text-sm"
          value={permissionMode}
          onChange={(e) => {
            setPermissionMode(e.target.value);
            setBypassConfirmed(false);
          }}
        >
          {PERMISSION_MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>

      {permissionMode === "BypassPermissions" && (
        <div
          data-testid="bypass-warning"
          className="rounded border border-red-500/50 bg-red-500/10 p-2 text-xs"
        >
          <p className="font-medium">⚠️ This agent will run without permission prompts.</p>
          <p className="text-muted-foreground">
            Every tool call — including shell commands and file writes — executes immediately.
          </p>
          <label className="mt-1 flex items-center gap-2">
            <input
              type="checkbox"
              checked={bypassConfirmed}
              onChange={(e) => setBypassConfirmed(e.target.checked)}
            />
            I understand the risk
          </label>
        </div>
      )}

      <div className="flex gap-4 text-xs">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
          Pinned to crew bar
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={autoSpawn} onChange={(e) => setAutoSpawn(e.target.checked)} />
          Auto-spawn on startup
        </label>
      </div>

      <PersonaComposer name={name} persona={persona} onChange={setPersona} />

      <div className="flex flex-wrap items-center gap-2 border-t pt-2">
        <Button size="sm" disabled={!name.trim() || needsBypassConfirm || busy} onClick={() => void save()}>
          {agent ? "Save" : "Hire 🎉"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <span className="flex-1" />
        <Button
          size="sm"
          variant="outline"
          disabled={!selectedProject}
          title={
            selectedProject
              ? "Write the persona as a fenced crewhub block in the project's CLAUDE.md"
              : "Pick a registered project first"
          }
          onClick={() => void materialize(false)}
        >
          Write to CLAUDE.md
        </Button>
        <Button size="sm" variant="ghost" disabled={!selectedProject} onClick={() => void materialize(true)}>
          Remove from CLAUDE.md
        </Button>
      </div>
      {materializeNote && <p className="text-xs text-muted-foreground">{materializeNote}</p>}
      {error && (
        <p data-testid="editor-error" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

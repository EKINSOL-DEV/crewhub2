// Template library (T15, EKI-39): CRUD over `prompt_templates` inside the
// automation panel. One `{{var}}` syntax everywhere (D-M4-8); the variable
// list is derived live from the template text (no drift between text and
// declaration — declared defaults are extra, names are truth-from-text).
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import type { PromptTemplate } from "@/ipc/bindings";
import { PREVIOUS_OUTPUT_VAR, referencedVariables } from "@/lib/render-template";
import { useProjects } from "@/app/project-filter";
import { parseVariables, useTemplatesStore } from "@/stores/templates";

interface TplDraft {
  name: string;
  template: string;
  defaults: Record<string, string>;
  projectId: string | null;
}

function draftFrom(t: PromptTemplate | null): TplDraft {
  return {
    name: t?.name ?? "",
    template: t?.template ?? "",
    defaults: Object.fromEntries(
      parseVariables(t?.variables_json ?? null)
        .filter((v) => v.default !== undefined)
        .map((v) => [v.name, v.default as string]),
    ),
    projectId: t?.project_id ?? null,
  };
}

/** variables_json from the draft: referenced names + any defaults typed in. */
export function buildVariablesJson(template: string, defaults: Record<string, string>): string | null {
  const names = referencedVariables(template).filter((n) => n !== PREVIOUS_OUTPUT_VAR);
  if (names.length === 0) return null;
  return JSON.stringify(names.map((name) => (defaults[name] ? { name, default: defaults[name] } : { name })));
}

function TemplateEditor({ existing, onClose }: { existing: PromptTemplate | null; onClose: () => void }) {
  const [draft, setDraft] = useState<TplDraft>(() => draftFrom(existing));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const projects = useProjects((s) => s.projects);

  const varNames = referencedVariables(draft.template).filter((n) => n !== PREVIOUS_OUTPUT_VAR);

  const save = async () => {
    if (!draft.name.trim()) {
      setError("a template needs a name");
      return;
    }
    if (!draft.template.trim()) {
      setError("a template needs a body");
      return;
    }
    setBusy(true);
    setError(null);
    const variables_json = buildVariablesJson(draft.template, draft.defaults);
    const store = useTemplatesStore.getState();
    const err = existing
      ? await store.update({
          ...existing,
          name: draft.name.trim(),
          template: draft.template,
          variables_json,
          project_id: draft.projectId,
        })
      : await store.create({
          name: draft.name.trim(),
          template: draft.template,
          variables_json,
          project_id: draft.projectId,
        });
    setBusy(false);
    if (err) setError(err);
    else onClose();
  };

  return (
    <div data-testid="template-editor" className="flex flex-col gap-2 rounded border bg-card p-3">
      <h3 className="text-xs font-semibold">{existing ? "📜 Edit template" : "📜 New template"}</h3>
      <label className="flex flex-col gap-1 text-xs">
        name
        <input
          autoFocus
          aria-label="Template name"
          className="rounded border bg-background px-2 py-1 text-xs"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        template ({"{{var}}"} placeholders become fill-ins on insert)
        <textarea
          aria-label="Template body"
          className="min-h-24 rounded border bg-background px-2 py-1 font-mono text-xs"
          value={draft.template}
          onChange={(e) => setDraft((d) => ({ ...d, template: e.target.value }))}
        />
      </label>
      {varNames.length > 0 && (
        <fieldset className="flex flex-col gap-1 text-xs">
          <legend className="text-xs text-muted-foreground">variables (defaults optional)</legend>
          {varNames.map((name) => (
            <label key={name} className="flex items-center gap-1">
              <span className="rounded bg-muted px-1 font-mono text-[10px]">{`{{${name}}}`}</span>
              <input
                aria-label={`Default for ${name}`}
                placeholder="no default"
                className="flex-1 rounded border bg-background px-1.5 py-0.5 text-xs"
                value={draft.defaults[name] ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, defaults: { ...d.defaults, [name]: e.target.value } }))
                }
              />
            </label>
          ))}
        </fieldset>
      )}
      <label className="flex items-center gap-1 text-xs">
        scope
        <select
          aria-label="Template scope"
          className="rounded border bg-background px-1 py-0.5 text-xs"
          value={draft.projectId ?? ""}
          onChange={(e) => setDraft((d) => ({ ...d, projectId: e.target.value || null }))}
        >
          <option value="">🌍 global</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.icon ?? "🗺️"} {p.name}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p data-testid="template-editor-error" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button size="xs" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button size="xs" disabled={busy} data-testid="template-save" onClick={() => void save()}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function TemplateRow({ template, onEdit }: { template: PromptTemplate; onEdit: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const projects = useProjects((s) => s.projects);
  const projectName = template.project_id
    ? (projects.find((p) => p.id === template.project_id)?.name ?? "project")
    : null;
  const vars = referencedVariables(template.template);

  return (
    <li
      data-testid={`template-row-${template.id}`}
      className="pop-in flex items-center gap-2 rounded border px-2 py-1.5 text-xs"
    >
      <span className="font-medium">📜 {template.name}</span>
      <span className="flex flex-1 flex-wrap gap-1">
        {vars.map((v) => (
          <span key={v} className="rounded bg-muted px-1 font-mono text-[10px]">
            {`{{${v}}}`}
          </span>
        ))}
      </span>
      <span className="text-[10px] text-muted-foreground">{projectName ?? "🌍 global"}</span>
      <Button size="xs" variant="ghost" onClick={onEdit}>
        Edit
      </Button>
      {confirmDelete ? (
        <Button
          size="xs"
          variant="destructive"
          onClick={() => void useTemplatesStore.getState().remove(template.id)}
        >
          Sure?
        </Button>
      ) : (
        <Button size="xs" variant="ghost" onClick={() => setConfirmDelete(true)}>
          Delete
        </Button>
      )}
    </li>
  );
}

export function TemplateLibrary({ projectId }: { projectId: string | null }) {
  const templatesById = useTemplatesStore((s) => s.templates);
  const loaded = useTemplatesStore((s) => s.loaded);
  const error = useTemplatesStore((s) => s.error);
  const [editing, setEditing] = useState<PromptTemplate | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void useTemplatesStore.getState().init();
    if (projectId) void useTemplatesStore.getState().loadProject(projectId);
  }, [projectId]);

  const templates = Object.values(templatesById)
    .filter((t) => t.project_id === null || t.project_id === projectId)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div data-testid="template-library" className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 className="flex-1 text-xs font-semibold">📜 Prompt templates</h3>
        <Button size="xs" data-testid="new-template" onClick={() => setCreating(true)}>
          ＋ New template
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {(creating || editing) && (
        <TemplateEditor
          existing={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
      {loaded && templates.length === 0 && !creating && (
        <EmptyState
          emoji="📜"
          title="No templates yet"
          hint="Reusable prompts with {{variables}} — insertable in chat, runs and sequences"
          action={
            <Button size="xs" variant="outline" onClick={() => setCreating(true)}>
              ＋ New template
            </Button>
          }
        />
      )}
      {templates.length > 0 && (
        <ul className="flex flex-col gap-1">
          {templates.map((t) => (
            <TemplateRow key={t.id} template={t} onEdit={() => setEditing(t)} />
          ))}
        </ul>
      )}
    </div>
  );
}

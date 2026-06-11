// Template insert picker (T15, EKI-39): templates (global + project) listed
// ALONGSIDE the project's slash commands and skills from `list_slash_commands`
// (D-M4-8 AC: the library reflects what sessions can actually do). Templates
// with variables get a fill mini-form; a variable left blank stays a literal
// `{{name}}` chip (so `{{previous_output}}` survives into sequence steps).
// Mounted by the chat composer and the run/sequence prompt fields.
import { useEffect, useState } from "react";
import { useProjects } from "@/app/project-filter";
import { Button } from "@/components/ui/button";
import { commands, type PromptTemplate, type SlashCommand } from "@/ipc/bindings";
import { referencedVariables, renderTemplate } from "@/lib/render-template";
import { parseVariables, templatesForProject, useTemplatesStore } from "@/stores/templates";

/** Variables to offer in the fill form: declared ∪ referenced, declared order first. */
export function variablesToFill(template: PromptTemplate): { name: string; default: string }[] {
  const declared = parseVariables(template.variables_json);
  const names = new Set(declared.map((v) => v.name));
  const out = declared.map((v) => ({ name: v.name, default: v.default ?? "" }));
  for (const name of referencedVariables(template.template)) {
    if (!names.has(name)) out.push({ name, default: "" });
  }
  return out;
}

/** Render with blanks kept literal — never a silently-empty substitution. */
export function renderWithBlanksKept(template: string, filled: Record<string, string>): string {
  const vars: Record<string, string> = {};
  for (const name of referencedVariables(template)) {
    const v = filled[name];
    vars[name] = v !== undefined && v !== "" ? v : `{{${name}}}`;
  }
  return renderTemplate(template, vars);
}

function VariableFillForm({
  template,
  onInsert,
  onBack,
}: {
  template: PromptTemplate;
  onInsert: (text: string) => void;
  onBack: () => void;
}) {
  const [filled, setFilled] = useState<Record<string, string>>(() =>
    Object.fromEntries(variablesToFill(template).map((v) => [v.name, v.default])),
  );
  const vars = variablesToFill(template);

  return (
    <div data-testid="template-fill-form" className="flex flex-col gap-1 p-2">
      <p className="text-xs font-medium">📜 {template.name}</p>
      {vars.map((v) => (
        <label key={v.name} className="flex items-center gap-1 text-xs">
          <span className="font-mono text-[10px]">{`{{${v.name}}}`}</span>
          <input
            aria-label={`Template variable ${v.name}`}
            placeholder="blank = keep the chip"
            className="flex-1 rounded border bg-background px-1.5 py-0.5 text-xs"
            value={filled[v.name] ?? ""}
            onChange={(e) => setFilled((f) => ({ ...f, [v.name]: e.target.value }))}
          />
        </label>
      ))}
      <div className="flex justify-end gap-1 pt-1">
        <Button size="xs" variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button
          size="xs"
          data-testid="template-fill-insert"
          onClick={() => onInsert(renderWithBlanksKept(template.template, filled))}
        >
          Insert
        </Button>
      </div>
    </div>
  );
}

/**
 * The one-stop mount for prompt fields (composer, run editor, sequence
 * steps): a 📜 button toggling the picker. Resolves the template scope from
 * the project path (worktrees inherit the parent project's templates).
 */
export function InsertTemplateButton({
  projectPath,
  onInsert,
  popoverClassName = "absolute bottom-full left-0 z-40 mb-1",
}: {
  projectPath: string | null;
  onInsert: (text: string) => void;
  popoverClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const projects = useProjects((s) => s.projects);
  const projectId =
    (projectPath &&
      projects.find((p) => projectPath === p.folder_path || projectPath.startsWith(`${p.folder_path}/`))
        ?.id) ||
    null;

  return (
    <span className="relative inline-flex">
      <Button
        size="xs"
        variant={open ? "default" : "ghost"}
        data-testid="insert-template-button"
        title="Insert a template, slash command or skill"
        onClick={() => setOpen((o) => !o)}
      >
        📜
      </Button>
      {open && (
        <TemplatePicker
          className={popoverClassName}
          projectId={projectId}
          projectPath={projectPath}
          onInsert={(text) => {
            onInsert(text);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </span>
  );
}

export interface TemplatePickerProps {
  /** Scope for templates (active project), null = global only. */
  projectId: string | null;
  /** When set, the project's slash commands/skills are listed alongside. */
  projectPath?: string | null | undefined;
  onInsert: (text: string) => void;
  onClose: () => void;
  /** Extra classes for the popover (positioning is the mount's business). */
  className?: string | undefined;
}

export function TemplatePicker({
  projectId,
  projectPath,
  onInsert,
  onClose,
  className,
}: TemplatePickerProps) {
  const templatesById = useTemplatesStore((s) => s.templates);
  const loaded = useTemplatesStore((s) => s.loaded);
  const [slash, setSlash] = useState<SlashCommand[]>([]);
  const [filter, setFilter] = useState("");
  const [filling, setFilling] = useState<PromptTemplate | null>(null);

  useEffect(() => {
    void useTemplatesStore.getState().init();
    if (projectId) void useTemplatesStore.getState().loadProject(projectId);
  }, [projectId]);

  useEffect(() => {
    if (!projectPath) return;
    let live = true;
    void commands
      .listSlashCommands(projectPath)
      .then((res) => {
        if (live && res.status === "ok") setSlash(res.data);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [projectPath]);

  const q = filter.trim().toLowerCase();
  const templates = templatesForProject(templatesById, projectId).filter(
    (t) => !q || t.name.toLowerCase().includes(q),
  );
  const slashMatches = slash.filter((c) => !q || c.name.toLowerCase().includes(q));

  const pick = (t: PromptTemplate) => {
    if (variablesToFill(t).length > 0) setFilling(t);
    else onInsert(t.template);
  };

  return (
    <div
      data-testid="template-picker"
      className={`w-80 overflow-hidden rounded-md border border-border bg-card text-xs shadow-md ${className ?? ""}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      {filling ? (
        <VariableFillForm template={filling} onInsert={onInsert} onBack={() => setFilling(null)} />
      ) : (
        <>
          <input
            autoFocus
            aria-label="Filter templates and commands"
            placeholder="filter…"
            className="w-full border-b border-border bg-card px-2 py-1 text-xs outline-none"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <div className="max-h-64 overflow-auto">
            {templates.length > 0 && <p className="px-2 pt-1 text-[10px] text-muted-foreground">templates</p>}
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                data-testid={`template-option-${t.id}`}
                className="flex w-full items-baseline gap-2 px-2 py-1 text-left hover:bg-accent/20"
                onClick={() => pick(t)}
              >
                <span className="font-medium">📜 {t.name}</span>
                <span className="flex flex-wrap gap-1">
                  {variablesToFill(t).map((v) => (
                    <span key={v.name} className="rounded bg-muted px-1 font-mono text-[10px]">
                      {`{{${v.name}}}`}
                    </span>
                  ))}
                </span>
                {t.project_id && <span className="text-[10px] text-muted-foreground">project</span>}
              </button>
            ))}
            {slashMatches.length > 0 && (
              <p className="px-2 pt-1 text-[10px] text-muted-foreground">slash commands & skills</p>
            )}
            {slashMatches.map((c) => (
              <button
                key={c.name}
                type="button"
                data-testid={`picker-slash-${c.name}`}
                className="flex w-full items-baseline gap-2 px-2 py-1 text-left hover:bg-accent/20"
                onClick={() => onInsert(`/${c.name} `)}
              >
                <span className="font-mono">/{c.name}</span>
                {c.description && <span className="truncate text-muted-foreground">{c.description}</span>}
              </button>
            ))}
            {loaded && templates.length === 0 && slashMatches.length === 0 && (
              <p data-testid="template-picker-empty" className="px-2 py-2 text-muted-foreground">
                📜 no templates yet{q ? " (or nothing matches)" : ""} — create one in the automation panel
              </p>
            )}
          </div>
          <div className="border-t border-border px-2 py-0.5 text-[10px] text-muted-foreground">
            Esc to dismiss
          </div>
        </>
      )}
    </div>
  );
}

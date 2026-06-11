// Schedule editor (T13, EKI-30): create/edit one `runs` row. The spec is the
// D-M4-5 tagged union — prompt and standup get structured forms, anything
// else falls back to a raw-JSON editor (parse-tolerance, mirrored from the
// read side). The cron field previews through the `preview_cron` IPC (one
// source of truth — the Rust scheduler's own `next_fire`), including the
// honest "schedules run only while CrewHub is open" note.
import { useEffect, useMemo, useRef, useState } from "react";
import { useProjects } from "@/app/project-filter";
import { Button } from "@/components/ui/button";
import { DEFAULT_MODEL, ModelPicker, isModelTierId } from "@/components/ModelPicker";
import { commands, type CronPreview, type Run } from "@/ipc/bindings";
import { useAgentsStore } from "@/stores/agents";
import { useAutomationStore } from "@/stores/automation";
import { parseRunSpec, type RunSpec } from "./run-spec";
import { emptyStep, SequenceEditor, validateSteps, type DraftStep } from "./SequenceEditor";

type DraftAction = "prompt" | "sequence" | "standup" | "raw";

interface Draft {
  action: DraftAction;
  projectPath: string;
  prompt: string;
  model: string;
  steps: DraftStep[];
  standupTitle: string;
  standupAgents: string[]; // empty = all non-archived agents
  rawSpec: string;
  cron: string; // "" = manual (run on demand)
  enabled: boolean;
}

function draftFrom(run: Run | null, initialSpecJson?: string, initialCron?: string): Draft {
  const base: Draft = {
    action: "prompt",
    projectPath: "",
    prompt: "",
    model: DEFAULT_MODEL,
    steps: [emptyStep()],
    standupTitle: "",
    standupAgents: [],
    rawSpec: "",
    cron: initialCron ?? "",
    enabled: run?.enabled ?? true,
  };
  const specJson = run?.spec_json ?? initialSpecJson;
  if (run?.schedule_cron) base.cron = run.schedule_cron;
  if (!specJson) return base;
  const spec = parseRunSpec(specJson);
  switch (spec?.action) {
    case "prompt":
      return {
        ...base,
        action: "prompt",
        projectPath: spec.project_path,
        prompt: spec.prompt,
        model: spec.model && isModelTierId(spec.model) ? spec.model : DEFAULT_MODEL,
      };
    case "sequence":
      return {
        ...base,
        action: "sequence",
        steps: spec.steps.map((s) => ({
          projectPath: s.project_path,
          prompt: s.prompt,
          model: s.model && isModelTierId(s.model) ? s.model : DEFAULT_MODEL,
        })),
      };
    case "standup":
      return {
        ...base,
        action: "standup",
        standupTitle: spec.title ?? "",
        standupAgents: spec.agent_ids ?? [],
      };
    default:
      // unreadable / future shapes — raw JSON, still editable
      return { ...base, action: "raw", rawSpec: specJson };
  }
}

function buildSpecJson(d: Draft): { spec: string } | { error: string } {
  switch (d.action) {
    case "prompt": {
      if (!d.projectPath.trim()) return { error: "a prompt run needs a project path" };
      if (!d.prompt.trim()) return { error: "a prompt run needs a prompt" };
      const spec: RunSpec = {
        action: "prompt",
        project_path: d.projectPath.trim(),
        prompt: d.prompt,
        model: d.model,
      };
      return { spec: JSON.stringify(spec) };
    }
    case "sequence": {
      const invalid = validateSteps(d.steps);
      if (invalid) return { error: invalid };
      const spec: RunSpec = {
        action: "sequence",
        steps: d.steps.map((s) => ({
          project_path: s.projectPath.trim(),
          prompt: s.prompt,
          model: s.model,
        })),
      };
      return { spec: JSON.stringify(spec) };
    }
    case "standup": {
      const spec: RunSpec = {
        action: "standup",
        agent_ids: d.standupAgents.length > 0 ? d.standupAgents : null,
        title: d.standupTitle.trim() || null,
      };
      return { spec: JSON.stringify(spec) };
    }
    case "raw": {
      try {
        JSON.parse(d.rawSpec);
      } catch {
        return { error: "spec must be valid JSON" };
      }
      return { spec: d.rawSpec };
    }
  }
}

/** Live cron preview via the `preview_cron` IPC (debounced). */
export function CronPreviewLine({ cron }: { cron: string }) {
  const [preview, setPreview] = useState<CronPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const expr = cron.trim();
    timer.current = setTimeout(() => {
      if (!expr) {
        setPreview(null);
        setPreviewError(null);
        return;
      }
      void commands
        .previewCron(expr)
        .then((res) => {
          if (res.status === "ok") {
            setPreview(res.data);
            setPreviewError(null);
          } else {
            setPreview(null);
            setPreviewError(res.error);
          }
        })
        .catch(() => setPreviewError("preview unavailable"));
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [cron]);

  if (!cron.trim()) return null;
  if (previewError) {
    return (
      <p data-testid="cron-preview-error" className="text-xs text-destructive">
        {previewError}
      </p>
    );
  }
  if (!preview) return null;
  return (
    <div data-testid="cron-preview" className="flex flex-col gap-0.5 text-xs text-muted-foreground">
      {preview.desc && <p>{preview.desc}</p>}
      <p>
        next:{" "}
        {preview.next
          .map((t) => new Date(t).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }))
          .join(" · ")}
      </p>
      {/* the honest copy from the backend — displayed, not tucked in a tooltip */}
      <p data-testid="cron-honest-note">⚠️ {preview.note}</p>
    </div>
  );
}

export interface ScheduleEditorProps {
  /** Existing run to edit, or null to create. */
  run: Run | null;
  /** Prefill for the create path (Lane G's standup "Schedule this" deep-link). */
  initialSpecJson?: string | undefined;
  initialCron?: string | undefined;
  onClose: () => void;
}

export function ScheduleEditor({ run, initialSpecJson, initialCron, onClose }: ScheduleEditorProps) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(run, initialSpecJson, initialCron));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const agents = useAgentsStore((s) => s.agents);
  const projects = useProjects((s) => s.projects);

  useEffect(() => {
    void useAgentsStore.getState().init();
  }, []);

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  const actionChoices = useMemo<{ id: DraftAction; label: string }[]>(() => {
    const base: { id: DraftAction; label: string }[] = [
      { id: "prompt", label: "💬 prompt" },
      { id: "sequence", label: "⛓️ sequence" },
      { id: "standup", label: "☕ standup" },
    ];
    if (draft.action === "raw") base.push({ id: "raw", label: "🧾 raw spec" });
    return base;
  }, [draft.action]);

  const save = async () => {
    const built = buildSpecJson(draft);
    if ("error" in built) {
      setError(built.error);
      return;
    }
    setBusy(true);
    setError(null);
    const cron = draft.cron.trim() || null;
    const store = useAutomationStore.getState();
    const err = run
      ? await store.update({
          ...run,
          kind: cron ? "scheduled" : "manual",
          schedule_cron: cron,
          spec_json: built.spec,
          enabled: draft.enabled,
        })
      : await store.create({
          kind: cron ? "scheduled" : "manual",
          schedule_cron: cron,
          spec_json: built.spec,
        });
    setBusy(false);
    if (err) setError(err);
    else onClose();
  };

  return (
    <div
      data-testid="schedule-editor"
      className="absolute inset-0 z-30 flex items-start justify-center overflow-auto bg-background/60 py-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="w-[28rem] max-w-[92%] rounded-lg border bg-card p-4 shadow-xl">
        <h2 className="mb-3 text-sm font-semibold">{run ? "⏰ Edit run" : "⏰ New run"}</h2>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-1 text-xs">
            action
            <select
              aria-label="Run action"
              className="rounded border bg-background px-1 py-0.5 text-xs"
              value={draft.action}
              onChange={(e) => patch({ action: e.target.value as DraftAction })}
            >
              {actionChoices.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          {/* shared by the prompt form and every sequence step */}
          <datalist id="automation-project-paths">
            {projects.map((p) => (
              <option key={p.id} value={p.folder_path}>
                {p.name}
              </option>
            ))}
          </datalist>

          {draft.action === "prompt" && (
            <>
              <label className="flex flex-col gap-1 text-xs">
                project path
                <input
                  aria-label="Run project path"
                  className="rounded border bg-background px-2 py-1 font-mono text-xs"
                  list="automation-project-paths"
                  value={draft.projectPath}
                  onChange={(e) => patch({ projectPath: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                prompt
                <textarea
                  aria-label="Run prompt"
                  className="min-h-20 rounded border bg-background px-2 py-1 text-xs"
                  value={draft.prompt}
                  onChange={(e) => patch({ prompt: e.target.value })}
                />
              </label>
              {/* haiku default — never a hardcoded expensive model (D-M4-3) */}
              <ModelPicker value={draft.model} onChange={(m) => patch({ model: m })} />
            </>
          )}

          {draft.action === "sequence" && (
            <SequenceEditor steps={draft.steps} onChange={(steps) => patch({ steps })} />
          )}

          {draft.action === "standup" && (
            <>
              <label className="flex flex-col gap-1 text-xs">
                title
                <input
                  aria-label="Standup title"
                  placeholder="Daily"
                  className="rounded border bg-background px-2 py-1 text-xs"
                  value={draft.standupTitle}
                  onChange={(e) => patch({ standupTitle: e.target.value })}
                />
              </label>
              <fieldset className="flex flex-col gap-1 text-xs">
                <legend className="text-xs">agents (none checked = everyone)</legend>
                <div className="flex max-h-28 flex-wrap gap-x-3 gap-y-1 overflow-auto">
                  {agents.map((a) => (
                    <label key={a.id} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        aria-label={`Standup agent ${a.name}`}
                        checked={draft.standupAgents.includes(a.id)}
                        onChange={(e) =>
                          patch({
                            standupAgents: e.target.checked
                              ? [...draft.standupAgents, a.id]
                              : draft.standupAgents.filter((id) => id !== a.id),
                          })
                        }
                      />
                      {a.icon ?? "🤖"} {a.name}
                    </label>
                  ))}
                  {agents.length === 0 && <span className="text-muted-foreground">no agents yet</span>}
                </div>
              </fieldset>
            </>
          )}

          {draft.action === "raw" && (
            <label className="flex flex-col gap-1 text-xs">
              spec_json (validated by the backend)
              <textarea
                aria-label="Raw run spec"
                className="min-h-24 rounded border bg-background px-2 py-1 font-mono text-xs"
                value={draft.rawSpec}
                onChange={(e) => patch({ rawSpec: e.target.value })}
              />
            </label>
          )}

          <label className="flex flex-col gap-1 text-xs">
            schedule (cron, blank = run on demand)
            <input
              aria-label="Cron expression"
              placeholder="0 9 * * 1-5"
              className="rounded border bg-background px-2 py-1 font-mono text-xs"
              value={draft.cron}
              onChange={(e) => patch({ cron: e.target.value })}
            />
          </label>
          <CronPreviewLine cron={draft.cron} />

          {run && (
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                aria-label="Run enabled"
                checked={draft.enabled}
                onChange={(e) => patch({ enabled: e.target.checked })}
              />
              enabled
            </label>
          )}

          {error && (
            <p data-testid="schedule-editor-error" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button size="xs" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button size="xs" disabled={busy} data-testid="schedule-save" onClick={() => void save()}>
              {busy ? "Saving…" : run ? "Save" : "Create"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

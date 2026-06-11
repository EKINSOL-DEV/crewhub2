// Sequence editor (T14, EKI-35): ordered steps, each a prompt template —
// deliberately minimal per D-M4-5/M4-R7 (serial, one variable, halt on
// failure; anything richer belongs to CC subagents/teams, not here).
// `{{previous_output}}` is the one reserved variable; a button inserts the
// chip so nobody has to remember the spelling.
import { useRef } from "react";
import { useProjects } from "@/app/project-filter";
import { Button } from "@/components/ui/button";
import { DEFAULT_MODEL, ModelPicker } from "@/components/ModelPicker";
import { PREVIOUS_OUTPUT_VAR, referencedVariables } from "@/lib/render-template";
import { InsertTemplateButton } from "./TemplatePicker";

export interface DraftStep {
  projectPath: string;
  prompt: string;
  model: string;
}

export function emptyStep(projectPath = ""): DraftStep {
  return { projectPath, prompt: "", model: DEFAULT_MODEL };
}

/**
 * Pure validation mirrored from the Rust write-time check
 * (`dispatch::validate_spec`): ≥1 step, every step needs a project path and a
 * prompt, and the only variable a step may reference is `{{previous_output}}`.
 */
export function validateSteps(steps: DraftStep[]): string | null {
  if (steps.length === 0) return "a sequence needs at least 1 step";
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]!;
    if (!s.projectPath.trim()) return `step ${i + 1} needs a project path`;
    if (!s.prompt.trim()) return `step ${i + 1} needs a prompt`;
    const unknown = referencedVariables(s.prompt).filter((v) => v !== PREVIOUS_OUTPUT_VAR);
    if (unknown.length > 0) {
      return `step ${i + 1} references unknown variable {{${unknown[0]}}} — only {{${PREVIOUS_OUTPUT_VAR}}} is available`;
    }
  }
  return null;
}

function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}

function StepCard({
  step,
  index,
  count,
  onPatch,
  onMove,
  onRemove,
}: {
  step: DraftStep;
  index: number;
  count: number;
  onPatch: (p: Partial<DraftStep>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const promptRef = useRef<HTMLTextAreaElement | null>(null);

  const insertPreviousOutput = () => {
    const ta = promptRef.current;
    const chip = `{{${PREVIOUS_OUTPUT_VAR}}}`;
    if (!ta) {
      onPatch({ prompt: step.prompt + chip });
      return;
    }
    const at = ta.selectionStart ?? step.prompt.length;
    onPatch({ prompt: step.prompt.slice(0, at) + chip + step.prompt.slice(ta.selectionEnd ?? at) });
  };

  return (
    <li
      data-testid={`sequence-step-${index}`}
      className="flex flex-col gap-1 rounded border bg-background p-2"
    >
      <div className="flex items-center gap-1 text-xs">
        <span className="rounded bg-muted px-1.5 font-mono text-[10px]">step {index + 1}</span>
        <span className="flex-1" />
        <Button
          size="xs"
          variant="ghost"
          aria-label={`Move step ${index + 1} up`}
          disabled={index === 0}
          onClick={() => onMove(-1)}
        >
          ↑
        </Button>
        <Button
          size="xs"
          variant="ghost"
          aria-label={`Move step ${index + 1} down`}
          disabled={index === count - 1}
          onClick={() => onMove(1)}
        >
          ↓
        </Button>
        <Button
          size="xs"
          variant="ghost"
          aria-label={`Remove step ${index + 1}`}
          disabled={count === 1}
          onClick={onRemove}
        >
          ✕
        </Button>
      </div>
      <label className="flex flex-col gap-1 text-xs">
        project path
        <input
          aria-label={`Step ${index + 1} project path`}
          className="rounded border bg-card px-2 py-1 font-mono text-xs"
          list="automation-project-paths"
          value={step.projectPath}
          onChange={(e) => onPatch({ projectPath: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="flex items-center gap-1">
          prompt
          <InsertTemplateButton
            projectPath={step.projectPath.trim() || null}
            popoverClassName="absolute top-full left-0 z-40 mt-1"
            onInsert={(text) => onPatch({ prompt: step.prompt + text })}
          />
        </span>
        <textarea
          ref={promptRef}
          aria-label={`Step ${index + 1} prompt`}
          className="min-h-14 rounded border bg-card px-2 py-1 text-xs"
          value={step.prompt}
          onChange={(e) => onPatch({ prompt: e.target.value })}
        />
      </label>
      <div className="flex items-end justify-between gap-2">
        {index > 0 ? (
          <Button
            size="xs"
            variant="outline"
            data-testid={`insert-previous-output-${index}`}
            title="Insert the previous step's output here"
            onClick={insertPreviousOutput}
          >
            ⛓️ {`{{${PREVIOUS_OUTPUT_VAR}}}`}
          </Button>
        ) : (
          <span className="text-[10px] text-muted-foreground">first step — nothing to chain yet</span>
        )}
        <ModelPicker
          className="items-end"
          label={`Step ${index + 1} model`}
          value={step.model}
          onChange={(m) => onPatch({ model: m })}
        />
      </div>
    </li>
  );
}

export function SequenceEditor({
  steps,
  onChange,
}: {
  steps: DraftStep[];
  onChange: (steps: DraftStep[]) => void;
}) {
  const projects = useProjects((s) => s.projects);

  return (
    <div data-testid="sequence-editor" className="flex flex-col gap-2">
      <p className="text-[10px] text-muted-foreground">
        steps run in order · {`{{${PREVIOUS_OUTPUT_VAR}}}`} carries the previous result · the first failure
        stops the sequence
      </p>
      <ol className="flex flex-col gap-2">
        {steps.map((step, i) => (
          <StepCard
            key={i}
            step={step}
            index={i}
            count={steps.length}
            onPatch={(p) => onChange(steps.map((s, j) => (j === i ? { ...s, ...p } : s)))}
            onMove={(dir) => onChange(move(steps, i, i + dir))}
            onRemove={() => onChange(steps.filter((_, j) => j !== i))}
          />
        ))}
      </ol>
      <Button
        size="xs"
        variant="outline"
        data-testid="add-sequence-step"
        onClick={() =>
          onChange([
            ...steps,
            emptyStep(steps[steps.length - 1]?.projectPath ?? projects[0]?.folder_path ?? ""),
          ])
        }
      >
        ＋ Add step
      </Button>
    </div>
  );
}

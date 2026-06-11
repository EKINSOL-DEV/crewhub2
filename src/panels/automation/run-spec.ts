// Pure helpers over `runs.spec_json` (M4 D-M4-5): the tagged union is
// validated at write time in Rust (`orchestrator/dispatch.rs`); this side
// parses TOLERANTLY at read time — an unknown/garbled spec renders as a
// placeholder row, never a crash.

export interface SeqStep {
  project_path: string;
  prompt: string;
  model?: string | null;
}

export type RunSpec =
  | { action: "prompt"; project_path: string; prompt: string; model?: string | null }
  | { action: "sequence"; steps: SeqStep[] }
  | { action: "standup"; agent_ids?: string[] | null; title?: string | null };

function isSeqStep(v: unknown): v is SeqStep {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return typeof s.project_path === "string" && typeof s.prompt === "string";
}

/** Parse-tolerant read of `spec_json`: anything off-shape is `null`. */
export function parseRunSpec(specJson: string): RunSpec | null {
  let v: unknown;
  try {
    v = JSON.parse(specJson);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  switch (o.action) {
    case "prompt":
      if (typeof o.project_path !== "string" || typeof o.prompt !== "string") return null;
      return {
        action: "prompt",
        project_path: o.project_path,
        prompt: o.prompt,
        model: typeof o.model === "string" ? o.model : null,
      };
    case "sequence":
      if (!Array.isArray(o.steps) || !o.steps.every(isSeqStep)) return null;
      return { action: "sequence", steps: o.steps };
    case "standup":
      return {
        action: "standup",
        agent_ids: Array.isArray(o.agent_ids) ? o.agent_ids.filter((a) => typeof a === "string") : null,
        title: typeof o.title === "string" ? o.title : null,
      };
    default:
      return null;
  }
}

export function specEmoji(spec: RunSpec | null): string {
  switch (spec?.action) {
    case "prompt":
      return "💬";
    case "sequence":
      return "⛓️";
    case "standup":
      return "☕";
    default:
      return "❓";
  }
}

function firstLine(text: string, max = 60): string {
  const line = (text.split("\n")[0] ?? "").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** One-line human summary for the runs table. */
export function specSummary(spec: RunSpec | null): string {
  switch (spec?.action) {
    case "prompt":
      return firstLine(spec.prompt) || "(empty prompt)";
    case "sequence": {
      const n = spec.steps.length;
      const head = spec.steps[0] ? firstLine(spec.steps[0].prompt, 40) : "";
      return `${n} step${n === 1 ? "" : "s"}${head ? ` — ${head}` : ""}`;
    }
    case "standup":
      return `${spec.title?.trim() || "Standup"} · ${spec.agent_ids?.length ? `${spec.agent_ids.length} agents` : "all agents"}`;
    default:
      return "(unreadable spec)";
  }
}

export function actionLabel(spec: RunSpec | null): string {
  return spec?.action ?? "unknown";
}

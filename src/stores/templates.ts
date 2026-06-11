// Prompt templates store (T15, EKI-39): CRUD over the M4 T8 IPC. Change
// notifications ride `SettingChanged { key: "prompt_templates" }` (the
// notification_rules precedent — config-shaped data gets no DomainEvent of
// its own, D-M4-8); the fold is a wholesale refetch of every scope this
// window ever loaded (templates are few; simplicity wins).
import { create } from "zustand";
import { commands, type NewPromptTemplate, type PromptTemplate } from "@/ipc/bindings";
import { onDomainEvent } from "@/ipc/events";

export const TEMPLATES_SETTING_KEY = "prompt_templates";

/** One declared template variable (`variables_json` entries, T8 contract). */
export interface TemplateVariable {
  name: string;
  default?: string | undefined;
}

/** Parse-tolerant read of `variables_json`: off-shape entries are dropped. */
export function parseVariables(variablesJson: string | null): TemplateVariable[] {
  if (!variablesJson) return [];
  let v: unknown;
  try {
    v = JSON.parse(variablesJson);
  } catch {
    return [];
  }
  if (!Array.isArray(v)) return [];
  const out: TemplateVariable[] = [];
  for (const item of v) {
    if (typeof item !== "object" || item === null) continue;
    const { name, default: def } = item as { name?: unknown; default?: unknown };
    if (typeof name !== "string" || !name.trim()) continue;
    out.push({ name: name.trim(), default: typeof def === "string" ? def : undefined });
  }
  return out;
}

/** Global templates plus the project's own, name-sorted (D-M4-8 scoping). */
export function templatesForProject(
  templates: Record<string, PromptTemplate>,
  projectId: string | null,
): PromptTemplate[] {
  return Object.values(templates)
    .filter((t) => t.project_id === null || t.project_id === projectId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

interface TemplatesState {
  /** Union of every scope fetched so far, by template id. */
  templates: Record<string, PromptTemplate>;
  loaded: boolean;
  error: string | null;

  /** Seed + subscribe once (global scope); later calls are no-ops. */
  init: () => Promise<void>;
  /** Pull a project's templates into the union (idempotent). */
  loadProject: (projectId: string) => Promise<void>;
  /** Refetch every known scope — the SettingChanged fold (also the test seam). */
  refresh: () => Promise<void>;
  create: (input: NewPromptTemplate) => Promise<string | null>;
  update: (template: PromptTemplate) => Promise<string | null>;
  remove: (id: string) => Promise<string | null>;
  reset: () => void;
}

let started = false;
/** `null` = global; project ids otherwise. Module-level so refresh sees all. */
const scopes = new Set<string | null>([null]);

export const useTemplatesStore = create<TemplatesState>((set, get) => ({
  templates: {},
  loaded: false,
  error: null,

  refresh: async () => {
    try {
      const merged: Record<string, PromptTemplate> = {};
      for (const scope of scopes) {
        const res = await commands.listPromptTemplates(scope);
        if (res.status === "ok") {
          for (const t of res.data) merged[t.id] = t;
        } else {
          set({ error: res.error, loaded: true });
          return;
        }
      }
      set({ templates: merged, loaded: true, error: null });
    } catch (e) {
      set({ error: String(e), loaded: true });
    }
  },

  init: async () => {
    if (started) return;
    started = true;
    await get().refresh();
    try {
      await onDomainEvent((e) => {
        if (e.type === "SettingChanged" && e.data.key === TEMPLATES_SETTING_KEY) void get().refresh();
      });
    } catch {
      // event bridge unavailable (unit tests) — refresh() stays callable
    }
  },

  loadProject: async (projectId) => {
    if (scopes.has(projectId)) return;
    scopes.add(projectId);
    await get().refresh();
  },

  create: async (input) => {
    try {
      const res = await commands.createPromptTemplate(input);
      if (res.status === "error") return res.error;
      set((s) => ({ templates: { ...s.templates, [res.data.id]: res.data } }));
      return null;
    } catch (e) {
      return String(e);
    }
  },

  update: async (template) => {
    try {
      const res = await commands.updatePromptTemplate(template);
      if (res.status === "error") return res.error;
      set((s) => ({ templates: { ...s.templates, [res.data.id]: res.data } }));
      return null;
    } catch (e) {
      return String(e);
    }
  },

  remove: async (id) => {
    try {
      const res = await commands.deletePromptTemplate(id);
      if (res.status === "error") return res.error;
      set((s) => {
        const templates = { ...s.templates };
        delete templates[id];
        return { templates };
      });
      return null;
    } catch (e) {
      return String(e);
    }
  },

  reset: () => {
    started = false;
    scopes.clear();
    scopes.add(null);
    set({ templates: {}, loaded: false, error: null });
  },
}));

// Settings store (extended in EKI-20): theme, density, font size and the
// default spawn model. Reads the KV once at boot, owns the in-memory truth,
// applies CSS on every change, persists best-effort. `SettingChanged` events
// reconcile cross-window state (settings window ↔ main window, Appendix B).
import { create } from "zustand";
import { commands } from "@/ipc/bindings";
import { onDomainEvent } from "@/ipc/events";
import { DEFAULT_MODEL, isModelTierId } from "@/components/ModelPicker";
import { applyDensity, applyFontSize, applyTheme } from "@/theme/apply";
import {
  DEFAULT_THEME,
  isDensity,
  isFontSize,
  isThemeName,
  type Density,
  type FontSize,
  type ThemeName,
} from "@/theme/themes";

interface SettingsState {
  theme: ThemeName;
  density: Density;
  fontSize: FontSize;
  defaultSpawnModel: string;
  loaded: boolean;
  load: () => Promise<void>;
  setTheme: (t: ThemeName) => Promise<void>;
  setDensity: (d: Density) => Promise<void>;
  setFontSize: (f: FontSize) => Promise<void>;
  setDefaultSpawnModel: (m: string) => Promise<void>;
}

async function readSetting(key: string): Promise<string | null> {
  const res = await commands.getSetting(key);
  return res.status === "ok" ? res.data : null;
}

function persist(key: string, value: string) {
  return commands.setSetting(key, value).catch(() => undefined);
}

/**
 * Reconcile one broadcast `SettingChanged` key into the store (Appendix B):
 * re-read the value and apply it exactly like `load()` would. Unwatched keys
 * (workspace.*, perm.rules, …) are other stores' business — ignored here.
 * Self-echoes (this window wrote the value) re-apply idempotently.
 */
export async function applySettingChange(key: string): Promise<void> {
  switch (key) {
    case "theme": {
      const v = await readSetting(key);
      if (isThemeName(v)) {
        applyTheme(v);
        useSettings.setState({ theme: v });
      }
      return;
    }
    case "ui.density": {
      const v = await readSetting(key);
      if (isDensity(v)) {
        applyDensity(v);
        useSettings.setState({ density: v });
      }
      return;
    }
    case "ui.font_size": {
      const v = await readSetting(key);
      if (isFontSize(v)) {
        applyFontSize(v);
        useSettings.setState({ fontSize: v });
      }
      return;
    }
    case "model.default_spawn": {
      const v = await readSetting(key);
      if (isModelTierId(v)) useSettings.setState({ defaultSpawnModel: v });
      return;
    }
    default:
  }
}

let eventsAttached = false;

/** Subscribe once to `SettingChanged` domain events (idempotent). */
async function attachSettingEvents(): Promise<void> {
  if (eventsAttached) return;
  eventsAttached = true;
  try {
    await onDomainEvent((e) => {
      if (e.type === "SettingChanged") void applySettingChange(e.data.key);
    });
  } catch {
    // event bridge unavailable (unit tests) — applySettingChange stays callable
  }
}

export const useSettings = create<SettingsState>((set) => ({
  theme: DEFAULT_THEME,
  density: "comfortable",
  fontSize: "m",
  defaultSpawnModel: DEFAULT_MODEL,
  loaded: false,

  load: async () => {
    let theme: ThemeName = DEFAULT_THEME;
    let density: Density = "comfortable";
    let fontSize: FontSize = "m";
    let defaultSpawnModel: string = DEFAULT_MODEL;
    try {
      const [t, d, f, m] = await Promise.all([
        readSetting("theme"),
        readSetting("ui.density"),
        readSetting("ui.font_size"),
        readSetting("model.default_spawn"),
      ]);
      if (isThemeName(t)) theme = t;
      if (isDensity(d)) density = d;
      if (isFontSize(f)) fontSize = f;
      if (isModelTierId(m)) defaultSpawnModel = m;
    } catch {
      // backend unavailable (e.g. unit tests) — fall back to defaults
    }
    applyTheme(theme);
    applyDensity(density);
    applyFontSize(fontSize);
    set({ theme, density, fontSize, defaultSpawnModel, loaded: true });
    await attachSettingEvents();
  },

  setTheme: async (theme) => {
    applyTheme(theme);
    set({ theme });
    await persist("theme", theme);
  },

  setDensity: async (density) => {
    applyDensity(density);
    set({ density });
    await persist("ui.density", density);
  },

  setFontSize: async (fontSize) => {
    applyFontSize(fontSize);
    set({ fontSize });
    await persist("ui.font_size", fontSize);
  },

  setDefaultSpawnModel: async (defaultSpawnModel) => {
    set({ defaultSpawnModel });
    await persist("model.default_spawn", defaultSpawnModel);
  },
}));

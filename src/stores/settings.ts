// Settings store (extended in EKI-20): theme, density, font size and the
// default spawn model. Reads the KV once at boot, owns the in-memory truth,
// applies CSS on every change, persists best-effort.
import { create } from "zustand";
import { commands } from "@/ipc/bindings";
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

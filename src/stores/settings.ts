import { create } from "zustand";
import { commands } from "@/ipc/bindings";
import { applyTheme } from "@/theme/apply";
import { DEFAULT_THEME, isThemeName, type ThemeName } from "@/theme/themes";

interface SettingsState {
  theme: ThemeName;
  loaded: boolean;
  load: () => Promise<void>;
  setTheme: (t: ThemeName) => Promise<void>;
}

export const useSettings = create<SettingsState>((set) => ({
  theme: DEFAULT_THEME,
  loaded: false,
  load: async () => {
    let theme: ThemeName = DEFAULT_THEME;
    try {
      const res = await commands.getSetting("theme");
      if (res.status === "ok" && isThemeName(res.data)) theme = res.data;
    } catch {
      // backend unavailable (e.g. unit tests) — fall back to default
    }
    applyTheme(theme);
    set({ theme, loaded: true });
  },
  setTheme: async (theme) => {
    applyTheme(theme);
    set({ theme });
    try {
      await commands.setSetting("theme", theme);
    } catch {
      // persistence is best-effort; UI already applied
    }
  },
}));

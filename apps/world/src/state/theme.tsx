/* Theme: system | light | dark on <html data-theme>, stored in this browser's localStorage. */
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from "react";

export type Theme = "system" | "light" | "dark";
const STORAGE_KEY = "crewhub-theme";
export const THEMES: readonly Theme[] = ["system", "light", "dark"];

function isTheme(v: unknown): v is Theme {
  return v === "system" || v === "light" || v === "dark";
}
function readLocal(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isTheme(v) ? v : "system";
  } catch {
    return "system";
  }
}
function writeLocal(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* private mode: the choice lasts for this page only */
  }
}

/* Keep the browser chrome colour in step with the resolved --bg. */
function syncThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  meta.setAttribute("content", getComputedStyle(document.documentElement).getPropertyValue("--bg").trim());
}

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  cycle: () => void;
}
const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readLocal);

  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    syncThemeColor();
    if (theme !== "system") return;
    /* With `system` the resolved colour follows the OS scheme. */
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    query.addEventListener("change", syncThemeColor);
    return () => query.removeEventListener("change", syncThemeColor);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    writeLocal(next);
    setThemeState(next);
  }, []);
  const cycle = useCallback(() => setTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length] ?? "system"), [setTheme, theme]);
  const value = useMemo(() => ({ theme, setTheme, cycle }), [theme, setTheme, cycle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const s = useContext(ThemeContext);
  if (!s) throw new Error("useTheme outside ThemeProvider");
  return s;
}

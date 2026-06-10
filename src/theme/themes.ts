export type ThemeName = "tokyo-night" | "nord" | "solarized-light";

export interface Theme {
  name: ThemeName;
  dark: boolean;
  vars: Record<string, string>;
}

export const THEMES: Record<ThemeName, Theme> = {
  "tokyo-night": {
    name: "tokyo-night",
    dark: true,
    vars: {
      "--background": "#1a1b26",
      "--foreground": "#c0caf5",
      "--card": "#16161e",
      "--accent": "#7aa2f7",
      "--border": "#292e42",
      "--muted": "#414868",
    },
  },
  nord: {
    name: "nord",
    dark: true,
    vars: {
      "--background": "#2e3440",
      "--foreground": "#eceff4",
      "--card": "#3b4252",
      "--accent": "#88c0d0",
      "--border": "#434c5e",
      "--muted": "#4c566a",
    },
  },
  "solarized-light": {
    name: "solarized-light",
    dark: false,
    vars: {
      "--background": "#fdf6e3",
      "--foreground": "#657b83",
      "--card": "#eee8d5",
      "--accent": "#268bd2",
      "--border": "#d3cbb7",
      "--muted": "#93a1a1",
    },
  },
};

export const THEME_NAMES = Object.keys(THEMES) as ThemeName[];
export const DEFAULT_THEME: ThemeName = "tokyo-night";

export function isThemeName(v: string | null | undefined): v is ThemeName {
  return v != null && v in THEMES;
}

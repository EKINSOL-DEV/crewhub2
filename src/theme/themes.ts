// Theme registry (EKI-20): all 9 v1 zen themes ported as compact palettes,
// expanded into one identical CSS-variable set per theme (panels rely on the
// status + chat-bubble vars; shadcn components on the rest).

export type ThemeName =
  | "tokyo-night"
  | "nord"
  | "solarized-light"
  | "catppuccin-mocha"
  | "dracula"
  | "github-light"
  | "gruvbox-dark"
  | "one-dark"
  | "solarized-dark";

/** The v1 zen palette shape — ported values, not ported code. */
interface ZenPalette {
  bg: string;
  bgPanel: string;
  bgHover: string;
  bgActive: string;
  fg: string;
  fgMuted: string;
  border: string;
  borderFocus: string;
  accent: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  userBubble: string;
  assistantBubble: string;
}

export interface Theme {
  name: ThemeName;
  dark: boolean;
  vars: Record<string, string>;
}

function expand(p: ZenPalette): Record<string, string> {
  return {
    "--background": p.bg,
    "--foreground": p.fg,
    "--card": p.bgPanel,
    "--card-foreground": p.fg,
    "--popover": p.bgPanel,
    "--popover-foreground": p.fg,
    "--primary": p.accent,
    "--primary-foreground": p.bg,
    "--secondary": p.bgHover,
    "--secondary-foreground": p.fg,
    "--muted": p.bgHover,
    "--muted-foreground": p.fgMuted,
    "--accent": p.bgHover,
    "--accent-foreground": p.fg,
    "--destructive": p.error,
    "--border": p.border,
    "--input": p.border,
    "--ring": p.borderFocus,
    "--sidebar": p.bgPanel,
    "--sidebar-foreground": p.fg,
    "--sidebar-primary": p.accent,
    "--sidebar-primary-foreground": p.bg,
    "--sidebar-accent": p.bgHover,
    "--sidebar-accent-foreground": p.fg,
    "--sidebar-border": p.border,
    "--sidebar-ring": p.borderFocus,
    // panel-facing extensions (status critters, chat bubbles, active surfaces)
    "--surface-active": p.bgActive,
    "--status-success": p.success,
    "--status-warning": p.warning,
    "--status-error": p.error,
    "--status-info": p.info,
    "--chat-user-bubble": p.userBubble,
    "--chat-assistant-bubble": p.assistantBubble,
  };
}

function theme(name: ThemeName, dark: boolean, palette: ZenPalette): Theme {
  return { name, dark, vars: expand(palette) };
}

export const THEMES: Record<ThemeName, Theme> = {
  "tokyo-night": theme("tokyo-night", true, {
    bg: "#1a1b26",
    bgPanel: "#24283b",
    bgHover: "#2f3549",
    bgActive: "#3d4560",
    fg: "#c0caf5",
    fgMuted: "#565f89",
    border: "#3d4560",
    borderFocus: "#7aa2f7",
    accent: "#7aa2f7",
    success: "#9ece6a",
    warning: "#e0af68",
    error: "#f7768e",
    info: "#7dcfff",
    userBubble: "#3d4560",
    assistantBubble: "#1e2030",
  }),
  nord: theme("nord", true, {
    bg: "#2e3440",
    bgPanel: "#3b4252",
    bgHover: "#434c5e",
    bgActive: "#4c566a",
    fg: "#eceff4",
    fgMuted: "#d8dee9",
    border: "#4c566a",
    borderFocus: "#88c0d0",
    accent: "#88c0d0",
    success: "#a3be8c",
    warning: "#ebcb8b",
    error: "#bf616a",
    info: "#81a1c1",
    userBubble: "#4c566a",
    assistantBubble: "#2e3440",
  }),
  "solarized-light": theme("solarized-light", false, {
    bg: "#fdf6e3",
    bgPanel: "#eee8d5",
    bgHover: "#e4ddc6",
    bgActive: "#d9d2b8",
    fg: "#657b83",
    fgMuted: "#839496",
    border: "#d9d2b8",
    borderFocus: "#268bd2",
    accent: "#268bd2",
    success: "#859900",
    warning: "#b58900",
    error: "#dc322f",
    info: "#2aa198",
    userBubble: "#eee8d5",
    assistantBubble: "#fdf6e3",
  }),
  "catppuccin-mocha": theme("catppuccin-mocha", true, {
    bg: "#1e1e2e",
    bgPanel: "#181825",
    bgHover: "#313244",
    bgActive: "#45475a",
    fg: "#cdd6f4",
    fgMuted: "#a6adc8",
    border: "#45475a",
    borderFocus: "#cba6f7",
    accent: "#cba6f7",
    success: "#a6e3a1",
    warning: "#f9e2af",
    error: "#f38ba8",
    info: "#89dceb",
    userBubble: "#45475a",
    assistantBubble: "#11111b",
  }),
  dracula: theme("dracula", true, {
    bg: "#282a36",
    bgPanel: "#21222c",
    bgHover: "#343746",
    bgActive: "#44475a",
    fg: "#f8f8f2",
    fgMuted: "#6272a4",
    border: "#44475a",
    borderFocus: "#bd93f9",
    accent: "#bd93f9",
    success: "#50fa7b",
    warning: "#ffb86c",
    error: "#ff5555",
    info: "#8be9fd",
    userBubble: "#44475a",
    assistantBubble: "#1e1f29",
  }),
  "github-light": theme("github-light", false, {
    bg: "#ffffff",
    bgPanel: "#f6f8fa",
    bgHover: "#eaeef2",
    bgActive: "#d0d7de",
    fg: "#24292f",
    fgMuted: "#57606a",
    border: "#d0d7de",
    borderFocus: "#0969da",
    accent: "#0969da",
    success: "#1a7f37",
    warning: "#9a6700",
    error: "#cf222e",
    info: "#0550ae",
    userBubble: "#ddf4ff",
    assistantBubble: "#f6f8fa",
  }),
  "gruvbox-dark": theme("gruvbox-dark", true, {
    bg: "#282828",
    bgPanel: "#3c3836",
    bgHover: "#504945",
    bgActive: "#665c54",
    fg: "#ebdbb2",
    fgMuted: "#a89984",
    border: "#504945",
    borderFocus: "#fe8019",
    accent: "#fe8019",
    success: "#b8bb26",
    warning: "#fabd2f",
    error: "#fb4934",
    info: "#83a598",
    userBubble: "#504945",
    assistantBubble: "#1d2021",
  }),
  "one-dark": theme("one-dark", true, {
    bg: "#282c34",
    bgPanel: "#21252b",
    bgHover: "#2c313a",
    bgActive: "#3e4451",
    fg: "#abb2bf",
    fgMuted: "#5c6370",
    border: "#3e4451",
    borderFocus: "#61afef",
    accent: "#61afef",
    success: "#98c379",
    warning: "#e5c07b",
    error: "#e06c75",
    info: "#56b6c2",
    userBubble: "#3e4451",
    assistantBubble: "#1b1d23",
  }),
  "solarized-dark": theme("solarized-dark", true, {
    bg: "#002b36",
    bgPanel: "#073642",
    bgHover: "#094554",
    bgActive: "#0b5567",
    fg: "#839496",
    fgMuted: "#657b83",
    border: "#094554",
    borderFocus: "#268bd2",
    accent: "#268bd2",
    success: "#859900",
    warning: "#b58900",
    error: "#dc322f",
    info: "#2aa198",
    userBubble: "#073642",
    assistantBubble: "#001f27",
  }),
};

export const THEME_NAMES = Object.keys(THEMES) as ThemeName[];
export const DEFAULT_THEME: ThemeName = "tokyo-night";

export function isThemeName(v: string | null | undefined): v is ThemeName {
  return v != null && v in THEMES;
}

// ── Density & font size (EKI-20) ─────────────────────────────────────────────

export type Density = "comfortable" | "compact";
export type FontSize = "s" | "m" | "l";

export const DENSITIES: readonly Density[] = ["comfortable", "compact"];
export const FONT_SIZES: readonly FontSize[] = ["s", "m", "l"];

export function isDensity(v: string | null | undefined): v is Density {
  return v === "comfortable" || v === "compact";
}

export function isFontSize(v: string | null | undefined): v is FontSize {
  return v === "s" || v === "m" || v === "l";
}

/** Tailwind v4 derives all spacing utilities from `--spacing`. */
export const DENSITY_SPACING: Record<Density, string> = {
  comfortable: "0.25rem",
  compact: "0.2rem",
};

/** Root font-size in px; everything is rem-based so this scales the UI. */
export const FONT_SIZE_PX: Record<FontSize, string> = {
  s: "14px",
  m: "16px",
  l: "18px",
};

import { DENSITY_SPACING, FONT_SIZE_PX, THEMES, type Density, type FontSize, type ThemeName } from "./themes";

export function applyTheme(name: ThemeName) {
  const t = THEMES[name];
  const root = document.documentElement;
  for (const [k, v] of Object.entries(t.vars)) root.style.setProperty(k, v);
  root.classList.toggle("dark", t.dark);
  root.dataset.theme = t.name;
}

/** Density scales every Tailwind spacing utility via the `--spacing` var. */
export function applyDensity(d: Density) {
  const root = document.documentElement;
  root.style.setProperty("--spacing", DENSITY_SPACING[d]);
  root.dataset.density = d;
}

/** The whole UI is rem-based — root font-size scales it in three steps. */
export function applyFontSize(s: FontSize) {
  const root = document.documentElement;
  root.style.fontSize = FONT_SIZE_PX[s];
  root.dataset.fontSize = s;
}

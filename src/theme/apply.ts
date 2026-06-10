import { THEMES, type ThemeName } from "./themes";

export function applyTheme(name: ThemeName) {
  const t = THEMES[name];
  const root = document.documentElement;
  for (const [k, v] of Object.entries(t.vars)) root.style.setProperty(k, v);
  root.classList.toggle("dark", t.dark);
  root.dataset.theme = t.name;
}

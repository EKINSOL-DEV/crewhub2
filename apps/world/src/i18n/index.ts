/* Adapter for the copied chat: loops' `useT` (crewhub-loops apps/web/src/i18n/index.ts @ a1bed0f) with the same flat dot
   keys, {var} interpolation and fallback to the key, over the English strings in ./en. English only. */
import { useCallback } from "react";
import { EN } from "./en";

export type Lang = "en";
export type Vars = Record<string, string | number>;

export function translate(key: string, vars?: Vars): string {
  let s = EN[key] ?? key;
  if (vars) for (const k of Object.keys(vars)) s = s.split(`{${k}}`).join(String(vars[k]));
  return s;
}

export function useT() {
  const lang: Lang = "en";
  const t = useCallback((key: string, vars?: Vars) => translate(key, vars), []);
  return { t, lang };
}

/* The viewer's style options (a season, a planting, ...): kept per viewer in this browser (state/setting.ts), like the
   viewer's cast. An option that is absent follows the town and the style's default; a zone or a building that sets one
   wins over it. */
import { createSetting } from "./setting.ts";

/** Only a flat object of strings is kept; anything else in storage reads as no choice. */
export function parseStyleOptions(text: string | null | undefined): Record<string, string> {
  try {
    const value: unknown = JSON.parse(text ?? "null");
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== ""));
  } catch {
    return {};
  }
}

export const styleOptions = createSetting<Record<string, string>>({
  key: "crewhub-world.style-options",
  parse: parseStyleOptions,
  format: (options) => (Object.keys(options).length ? JSON.stringify(options) : null),
});
export const useStyleOptions = styleOptions.use;

/** Sets one option; an empty value goes back to following the town. */
export function setStyleOption(id: string, value: string | null) {
  const next = { ...styleOptions.now() };
  if (value) next[id] = value;
  else delete next[id];
  styleOptions.set(next);
}

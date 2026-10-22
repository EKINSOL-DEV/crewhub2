/* The inline icon sprite's markup and element, without JSX so a node test can import it (round 30). Source:
   crewhub-loops apps/web/src/components/Icon.tsx @ a1bed0f: the sprite (24x24, stroke currentColor) with only the
   symbols the copied chat, Chip.Delivery, Avatar and Menu use. Add a symbol from the source when a re-copy needs one.
   The `dangerouslySetInnerHTML` object is made once: React rewrites the innerHTML whenever that object's identity
   changes, and a literal in the render function changed it on every render of World (the soak's detached nodes,
   round 29). */
import { createElement, type ReactElement } from "react";

const SYMBOLS = {
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
  "arrow-right": '<path d="M5 12h14M13 6l6 6-6 6"/>',
  inbox: '<path d="M4 13.5 6.5 5h11l2.5 8.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z"/><path d="M4 13.5h4.5l1.5 2.5h4l1.5-2.5H20"/>',
  help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.5a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2 1-1.2 1.8"/><path d="M12 16.6v.1"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  alert: '<path d="M12 4 21 19.5H3Z"/><path d="M12 10v4.2M12 17.2v.1"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
} as const;

export type IconName = keyof typeof SYMBOLS;

export const SPRITE = Object.entries(SYMBOLS)
  .map(([id, body]) => `<symbol id="i-${id}" viewBox="0 0 24 24">${body}</symbol>`)
  .join("");

/** The one `dangerouslySetInnerHTML` value of the sprite: its identity never changes, so React never rewrites it. */
export const SPRITE_HTML: { __html: string } = { __html: SPRITE };

const SPRITE_STYLE = { display: "none" } as const;

/** The hidden sprite element; App mounts it once. */
export function IconSprite(): ReactElement {
  return createElement("svg", { xmlns: "http://www.w3.org/2000/svg", style: SPRITE_STYLE, "aria-hidden": "true", dangerouslySetInnerHTML: SPRITE_HTML });
}

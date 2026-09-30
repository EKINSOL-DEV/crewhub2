/* The one module outside the style packages that imports a style: registration. Renderers receive a resolved
   `WorldStyle` per building (`styleRegistry.styleFor(plot)`) and never import style internals. */
import { greenhouseStyle } from "@crewhub/style-greenhouse";
import { createStyleRegistry } from "./styleRegistry";

/** The town default; a plot without its own style id uses it. Part of the town document in phase 5. */
export const DEFAULT_STYLE_ID = "greenhouse";

export const styleRegistry = createStyleRegistry(DEFAULT_STYLE_ID);
styleRegistry.registerStyle(greenhouseStyle);

export function createStyle(id: string) {
  return styleRegistry.getStyle(id);
}

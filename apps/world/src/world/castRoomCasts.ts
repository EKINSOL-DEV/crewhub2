/* The casts the casting room shows: every cast of the registry, drawn with the room's style. The casting room talks
   to `PreviewCast` only and never to a cast package. */
import type { FigureHandle, FigureOptions } from "@crewhub/world-cast";
import type { ResolvedStyle } from "@crewhub/world-style";
import { castRegistry } from "./cast";

export interface PreviewCast {
  id: string;
  name: string;
  description: string;
  figure(options: FigureOptions): FigureHandle;
}

export function previewCasts(style: ResolvedStyle): PreviewCast[] {
  return castRegistry.listCasts().map((manifest) => ({
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    figure: (options) => castRegistry.castFor(style, manifest.id).figure(options),
  }));
}

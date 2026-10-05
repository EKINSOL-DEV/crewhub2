/* The one module outside the cast packages that imports a cast: registration. Renderers receive a resolved `Cast`
   (`castRegistry.castFor(style, id)`) and never import cast internals. A new cast is one import and one line here. */
import { cast as classicBots } from "@crewhub/cast-classic-bots";
import { cast as sprouts } from "@crewhub/cast-sprouts";
import { createCastRegistry } from "./castRegistry.ts";

/** Drawn when nothing names a cast, and in place of an unknown one. */
export const FALLBACK_CAST_ID = "classic-bots";

export const castRegistry = createCastRegistry(FALLBACK_CAST_ID);
castRegistry.registerCast(classicBots);
castRegistry.registerCast(sprouts);

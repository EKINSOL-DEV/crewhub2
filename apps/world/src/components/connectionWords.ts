/* The connection chip's words and tone (design choice L1, round 72, `own-words`), Vite-free so apps/world/test/connectionWords.test.ts
   holds them as the chip, the Connection panel and App's announcement compute them; ConnectionChip.tsx keeps the markup
   and re-exports the words. The copy is the i18n file's. */
import type { ConnectionState } from "@crewhub/loops-client";
import { translate } from "../i18n/index.ts";

/** The chip's word for a state. */
export const connectionWord = (state: ConnectionState) => translate(`world.connection.${state}`);
/** The chip's hint: the state's sentence, with the host's own words where it has them (host-failed, design choice L1). */
export const connectionHint = (state: ConnectionState, reason: string | null = null) => translate(`world.connection.hint.${state}`, { reason: reason ?? translate("world.connection.hint.host-failed.none") });
/** The text view's one line. */
export const connectionLine = (state: ConnectionState) => translate("world.connection.text", { state: connectionWord(state) });

/** The chip's tone: Stale and Stream busy are the watchdog's muted chip; Loops down, Unauthorized, Pair again, Too many tabs and Host could not read loops the attention chip; the rest a plain chip. */
export type ChipTone = "stalled" | "attention" | "plain";
export const chipTone = (state: ConnectionState): ChipTone =>
  state === "stale" || state === "stream-busy" ? "stalled" : state === "loops-down" || state === "unauthorized" || state === "unpaired" || state === "host-tabs" || state === "host-failed" ? "attention" : "plain";

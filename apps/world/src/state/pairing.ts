/* The pairing's words on the page (round 31, question 2: a pairing unused for N days expires, the window sliding with
   every use): the Pair screen's expiry sentence and the Connection panel's Pairing row, from health's `pairing` and
   `pairingIdleDays`. Pure; the components translate. */
import type { HostHealth } from "@crewhub/loops-client";

export type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** The Pair screen's sentence about expiry: none when the host never expires a pairing or is from before the window. */
export function expiryWords(idleDays: number | undefined, t: Translate): string {
  if (idleDays === undefined || idleDays <= 0) return "";
  return t("world.pair.expiry", { days: idleDays });
}

/** The Connection panel's Pairing row: off in development, else the cookie and its window (never, or N days unused). */
export function pairingRowWords(health: Pick<HostHealth, "pairing" | "pairingIdleDays"> | null | undefined, t: Translate): string {
  if (health?.pairing === "off") return t("world.connection.panel.pairing.off");
  const days = health?.pairingIdleDays;
  const window = days === undefined ? "" : days > 0 ? t("world.connection.panel.pairing.expiry", { days }) : t("world.connection.panel.pairing.never");
  return `${t("world.connection.panel.pairing.browser")}${window}`;
}

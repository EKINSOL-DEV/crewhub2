/* The tab's pairing at start (round 27, per-tab bearer): what the page does before it asks the host anything. Pure:
   `pairingPlan` decides from what the URL and this tab hold; main.tsx carries it out with the client's bearer module. */

export type PairingPlan =
  /** The link's token is in the URL: exchange it for this tab's bearer (and take it out of the URL). */
  | { step: "redeem"; token: string }
  /** No token and no bearer: ask the other tabs of this origin for theirs, briefly. */
  | { step: "ask" }
  /** This tab holds a bearer already: nothing to do but answer other tabs. */
  | { step: "keep" };

export function pairingPlan(input: { token: string | null; bearer: string | null }): PairingPlan {
  if (input.token !== null) return { step: "redeem", token: input.token };
  return input.bearer === null ? { step: "ask" } : { step: "keep" };
}

/** The Pair screen's words about expiry: none when the host never expires a pairing or did not say. */
export function expiryWords(idleDays: number | undefined, translate: (key: string, vars?: Record<string, string | number>) => string): string {
  if (idleDays === undefined || idleDays <= 0) return "";
  return translate("world.pair.expiry", { days: idleDays });
}

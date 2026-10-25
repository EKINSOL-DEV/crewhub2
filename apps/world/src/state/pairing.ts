/* The tab's pairing at start (round 27, per-tab bearer): what the page does before it asks the host anything. Pure:
   `pairingPlan` decides from what the URL and this tab hold, `asksTabs` whether the other tabs are asked for their bearer
   once the source is decided, and `pairedDecision` is the start's order with its effects handed in; main.tsx carries it
   out with the client's bearer module. */
import type { HostHealth } from "@crewhub/loops-client";
import { needsPairing, type SourceDecision } from "./source.ts";

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

/**
 * Whether the start asks the other tabs of this origin for their bearer (round 39): only a tab that holds none and came
 * in without a link (the plan's `ask`), and only once the decided source is live and the host's health says this tab is
 * not paired. The demo (`?source=demo`, the setting, or `auto` over a silent host), a tab that holds a bearer, a tab that
 * came in through the link and a host without pairing never ask, so they never wait for an answer that cannot come.
 */
export function asksTabs(plan: PairingPlan, decision: Pick<SourceDecision, "source" | "health">): boolean {
  return plan.step === "ask" && needsPairing(decision);
}

/**
 * The start, in order (main.tsx hands in the effects): a link's token is redeemed first, so the source decision's health
 * probe carries the bearer; the source is decided; the other tabs are asked only where `asksTabs` says so, and a
 * sibling's answer leads to one more health probe with the bearer, so a second tab of a paired browser opens straight on
 * the town. A second probe that fails keeps the first health (the Pair screen then asks the host again by itself).
 */
export async function pairedDecision(io: {
  plan: PairingPlan;
  redeem: (token: string) => Promise<unknown>;
  decide: () => Promise<SourceDecision>;
  ask: () => Promise<string | null>;
  probe: () => Promise<HostHealth | null>;
}): Promise<SourceDecision> {
  if (io.plan.step === "redeem") await io.redeem(io.plan.token);
  const decision = await io.decide();
  if (!asksTabs(io.plan, decision)) return decision;
  const bearer = await io.ask();
  if (bearer === null) return decision;
  const fresh = await io.probe();
  return fresh === null ? decision : { ...decision, health: fresh };
}

/** The Pair screen's words about expiry: none when the host never expires a pairing or did not say. */
export function expiryWords(idleDays: number | undefined, translate: (key: string, vars?: Record<string, string | number>) => string): string {
  if (idleDays === undefined || idleDays <= 0) return "";
  return translate("world.pair.expiry", { days: idleDays });
}

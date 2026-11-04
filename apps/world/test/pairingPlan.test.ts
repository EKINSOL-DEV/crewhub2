import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { HostHealth } from "@crewhub/loops-client";
import { asksTabs, expiryWords, pairedDecision, pairingPlan, type PairingPlan } from "../src/state/pairing.ts";
import type { SourceDecision } from "../src/state/source.ts";

const health = (paired: boolean, pairing: HostHealth["pairing"] = "on"): HostHealth => ({ loops: "ok", keyName: "crewhub-world", sharedKey: false, paired, pairing });
const live = (h: HostHealth | null, reason: SourceDecision["reason"] = "probe-answered"): SourceDecision => ({ source: "live", setting: "auto", override: null, health: h, reason });
const demo = (reason: SourceDecision["reason"]): SourceDecision => ({ source: "demo", setting: "auto", override: reason === "url" ? "demo" : null, health: null, reason });
const ASK: PairingPlan = { step: "ask" };

describe("the tab's pairing at start", () => {
  it("a token in the URL is redeemed, a tab without a bearer asks the other tabs, a paired tab keeps its bearer", () => {
    assert.deepEqual(pairingPlan({ token: "t", bearer: null }), { step: "redeem", token: "t" });
    assert.deepEqual(pairingPlan({ token: "t", bearer: "b" }), { step: "redeem", token: "t" }, "a fresh link wins over an old bearer");
    assert.deepEqual(pairingPlan({ token: null, bearer: null }), { step: "ask" });
    assert.deepEqual(pairingPlan({ token: null, bearer: "b" }), { step: "keep" });
  });

  it("which starts ask the other tabs (round 39): only a tab without a bearer or a link, live, with the host saying it is not paired", () => {
    assert.equal(asksTabs(ASK, live(health(false))), true, "a first tab of the browser on a live host with pairing on");
    assert.equal(asksTabs(ASK, live(health(false), "setting")), true, "the live setting too");
    assert.equal(asksTabs(ASK, live(health(true))), false, "the host says paired (a bearer from before)");
    assert.equal(asksTabs(ASK, live(health(false, "off"))), false, "pairing off");
    assert.equal(asksTabs(ASK, live({ loops: "ok", keyName: "k", sharedKey: false })), false, "a host from before pairing");
    assert.equal(asksTabs(ASK, live(null, "setting")), false, "live set, the host silent");
    assert.equal(asksTabs(ASK, demo("url")), false, "?source=demo");
    assert.equal(asksTabs(ASK, demo("setting")), false, "the demo setting");
    assert.equal(asksTabs(ASK, demo("probe-silent")), false, "auto over a silent host");
    assert.equal(asksTabs({ step: "keep" }, live(health(false))), false, "a tab that holds a bearer never asks at start");
    assert.equal(asksTabs({ step: "redeem", token: "t" }, live(health(false))), false, "a tab that came in through the link never asks at start");
  });

  it("the start's order: redeem before the decision, the ask only where it helps, a sibling's answer followed by one more probe", async () => {
    const calls: string[] = [];
    const io = (plan: PairingPlan, decision: SourceDecision, answer: string | null, fresh: HostHealth | null = health(true)) => ({
      plan,
      redeem: async (token: string) => void calls.push(`redeem ${token}`),
      decide: async () => {
        calls.push("decide");
        return decision;
      },
      ask: async () => {
        calls.push("ask");
        return answer;
      },
      probe: async () => {
        calls.push("probe");
        return fresh;
      },
    });
    // The demo, a silent host, a kept bearer and the link: the decision is the start's, nothing asked, no second probe.
    for (const [plan, decision] of [
      [ASK, demo("url")],
      [ASK, demo("probe-silent")],
      [ASK, live(null, "setting")],
      [ASK, live(health(true))],
      [{ step: "keep" }, live(health(false))],
    ] as const) {
      calls.length = 0;
      assert.equal(await pairedDecision(io(plan, decision, "b")), decision);
      assert.deepEqual(calls, ["decide"], `${plan.step} ${decision.source} ${decision.reason}`);
    }
    calls.length = 0;
    const linked = live(health(true));
    assert.equal(await pairedDecision(io({ step: "redeem", token: "t" }, linked, "b")), linked);
    assert.deepEqual(calls, ["redeem t", "decide"], "the link's token is redeemed before the host is asked, and the tabs are not");
    // The first tab of a browser on a live host, not paired: the ask, and nobody answers: the Pair screen's decision.
    calls.length = 0;
    const unpaired = live(health(false));
    assert.equal(await pairedDecision(io(ASK, unpaired, null)), unpaired);
    assert.deepEqual(calls, ["decide", "ask"]);
    // A second tab of a paired browser: a sibling answers, one more probe with the bearer, straight on the town.
    calls.length = 0;
    const paired = await pairedDecision(io(ASK, unpaired, "bearer"));
    assert.deepEqual(calls, ["decide", "ask", "probe"]);
    assert.deepEqual(paired, { ...unpaired, health: health(true) });
    // The second probe fails: the first health stands (the Pair screen asks the host again by itself).
    calls.length = 0;
    assert.equal(await pairedDecision(io(ASK, unpaired, "bearer", null)), unpaired);
    assert.deepEqual(calls, ["decide", "ask", "probe"]);
  });

  it("the expiry words: the host's days, nothing for never or unknown", () => {
    const t = (key: string, vars?: Record<string, string | number>) => `${key}:${vars?.["days"] ?? ""}`;
    assert.equal(expiryWords(30, t), "world.pair.expiry:30");
    assert.equal(expiryWords(0, t), "");
    assert.equal(expiryWords(undefined, t), "");
  });
});

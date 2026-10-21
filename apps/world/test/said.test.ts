import assert from "node:assert/strict";
import test from "node:test";
import { SAID_FADE_MS, SAID_MS, clearSaid, getSaid, rememberSaid, saidBy, subscribeSaid } from "../src/state/said.ts";

const line = (agentId: string, text: string) => ({ agentId, agentName: agentId.toUpperCase(), text, at: "2026-10-21T19:00:00.000Z", messageId: `dm_${agentId}`, threadId: `dmt_${agentId}` });

test("said: an agent's line shows over that agent for SAID_MS, fades at the end, and the newest replaces the older", () => {
  clearSaid();
  const t0 = 1_000_000;
  let told = 0;
  const off = subscribeSaid(() => (told += 1));
  rememberSaid(line("boing", "On it. The nook is done,"), t0);
  assert.equal(told, 1);
  assert.deepEqual(saidBy("boing", t0), { text: "On it. The nook is done,", agentName: "BOING", messageId: "dm_boing", threadId: "dmt_boing", shownAt: t0, until: t0 + SAID_MS, fading: false });
  assert.equal(saidBy("other", t0), null);
  assert.equal(saidBy("boing", t0 + SAID_MS - SAID_FADE_MS)?.fading, true, "fading in the last seconds");
  assert.equal(saidBy("boing", t0 + SAID_MS), null, "gone when its time is up");
  rememberSaid(line("boing", "And the lamp."), t0 + 1000);
  assert.equal(saidBy("boing", t0 + 1000)?.text, "And the lamp.");
  assert.equal(getSaid().size, 1, "one line per agent");
  rememberSaid(line("g-man", "Busy and calm."), t0 + 1000);
  assert.equal(getSaid().size, 2);
  off();
  clearSaid();
  assert.equal(getSaid().size, 0);
});

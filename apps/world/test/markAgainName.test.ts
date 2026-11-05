/* A bubble shown again from its chat mark (round 67, v1-1 on sugg/w3-4) carries the speaker's name pill, as when it came
   (round 68, mutation run mx1): the bubble without the name (w3-2 draws the speaker's name on a bubble without a pill)
   passed every test. */
import assert from "node:assert/strict";
import test from "node:test";
import { createChatStores } from "../src/state/chatStores.ts";
import type { ChatLine } from "@crewhub/loops-client";

test("again: the bubble shown again has the answer's name, message and thread, as when it first came", () => {
  let now = 1_000;
  const s = createChatStores({ now: () => now, schedule: () => () => {} });
  s.said.remember({ agentId: "cr-lead", agentName: "Lead", messageId: "m7", threadId: "t-lead", text: "done", at: "2026-11-05T10:00:00.000Z" } as ChatLine);
  now += 13_000;
  s.said.again("cr-lead");
  const shown = s.said.lines().get("cr-lead");
  assert.equal(shown?.agentName, "Lead", "the name pill");
  assert.equal(shown?.messageId, "m7");
  assert.equal(shown?.threadId, "t-lead");
});

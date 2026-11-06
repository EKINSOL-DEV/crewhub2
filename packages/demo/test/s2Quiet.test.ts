/**
 * Design choice S2 (`drop`): g-man's answer to "Where am I needed right now?" at 2:58 in Studio. At that minute every
 * group has two tickets waiting on a person and the watchdog's open episodes are Apps 3, Brand 2, Lab 2, Platform 1,
 * so "Brand and Lab are the quiet ones" held on neither measure; the answer keeps its two counts and nothing else.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { STUDIO_STORY } from "../src/scenarios/studio.ts";
import { DEMO_SEED, buildStory } from "../src/script.ts";
import { at } from "../src/time.ts";

test("S2: g-man's where-am-I-needed answer names the two counts and no quiet group", () => {
  const entries = buildStory(STUDIO_STORY, DEMO_SEED);
  const replies = entries.filter((e) => e.action.type === "dmReply" && e.action.agent === "g-man" && Math.abs(e.at - at("2:58")) < 2000);
  assert.equal(replies.length, 1, "one reply by g-man at 2:58");
  const reply = replies[0]!.action;
  if (reply.type !== "dmReply") throw new Error("not a dmReply");
  assert.equal(reply.text, "Four reviews wait on you, and four tickets wait on an answer.");
});

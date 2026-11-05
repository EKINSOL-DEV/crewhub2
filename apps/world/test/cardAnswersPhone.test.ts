/* Round 65 (walk finding w4-9): the card's Answers section in the demo named the chat dock's place as "bottom right"; on a
   phone the dock is the "Agent chats" button at the top. The sentence now names both places. */
import assert from "node:assert/strict";
import test from "node:test";
import { cardAnswersEmpty } from "../src/state/chatRoad.ts";

test("the demo card's empty Answers names the dock at the bottom right and Agent chats at the top on a phone (round 65, w4-9)", () => {
  assert.equal(cardAnswersEmpty("demo", null), "No answer yet: write to it in the demo's chat (the dock at the bottom right, or Agent chats at the top on a phone) and its scripted reply shows here.");
  assert.equal(cardAnswersEmpty("demo", undefined), cardAnswersEmpty("demo", null), "the view does not matter in the demo");
});

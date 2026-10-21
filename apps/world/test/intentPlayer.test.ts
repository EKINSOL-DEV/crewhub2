/** The intent player's log line: "director:" in demo mode, "scripted director:" in live mode, on the same intent. */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Intent } from "@crewhub/world-model";
import { clearIntents, playIntent, playedIntents } from "../src/world/intentPlayer.ts";
import { agent, building, world } from "./fixtures.ts";

const model = world([building("cr", [agent("cr-dev-1", "lobby"), agent("cr-dev-2", "lobby")])]);
const intent: Intent = { kind: "goToProp", agent: "cr-dev-1", room: "lobby", tag: "coffee", ttlMs: 90_000 };

test("in demo mode the line says director; in live mode it says scripted director, and the intent is marked scripted", () => {
  clearIntents();
  const demo = playIntent(intent, { ...model, mode: "demo" });
  assert.equal(demo.scripted, false);
  assert.match(demo.text, /^director: cr-dev-1 /);
  const live = playIntent(intent, { ...model, mode: "live" });
  assert.equal(live.scripted, true);
  assert.match(live.text, /^scripted director: cr-dev-1 /);
  assert.equal(live.text.slice("scripted ".length), demo.text);
  assert.deepEqual(playedIntents().map((p) => p.scripted), [true, false]);
  clearIntents();
});

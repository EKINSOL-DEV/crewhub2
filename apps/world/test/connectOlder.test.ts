/* Design choice T9 (round 72, `disclosure`): on the Connect screen the paragraph for an older crewhub-loops without the
   CrewHub World card ("Settings › Agents › New external bot …") sits behind a disclosure, closed, so at 375 px the key
   field is not pushed below the first screenful. The summary is the paragraph's opening clause; the body keeps the
   steps and the CHL_WORLD_ORIGIN sentence (chatRoad.test.ts pins that sentence). The screen is a component (no DOM
   under node), so the markup is pinned as text and the pictures come from tools/connectshots.mjs. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { EN as en } from "../src/i18n/en.ts";

test("T9: the older-loops paragraph has a short summary and a body behind it", () => {
  const summary = en["world.connect.connect.older"];
  const body = en["world.connect.connect.viewer"] ?? "";
  assert.equal(typeof summary, "string", "the summary's key");
  assert.match(summary ?? "", /^On an older crewhub-loops without that card \(today's Mac app\)$/);
  assert.doesNotMatch(summary ?? "", /\*\*/, "the summary is plain words");
  assert.match(body, /^\*\*Settings › Agents › New external bot\*\*/, "the body starts with the steps, the clause is the summary");
  assert.match(body, /CHL_WORLD_ORIGIN=\{origin\}/);
  const page = readFileSync(new URL("../src/components/ConnectPage.tsx", import.meta.url), "utf8");
  assert.match(page, /<details className="connect-older">\s*<summary>\{t\("world.connect.connect.older"\)\}<\/summary>/, "a closed disclosure holds the paragraph");
});

/* Design choice L2 (round 72, `ignore`): road 2 ignores the browser's online flag. The page's own chat road only ever
   asks a crewhub-loops on this computer, and a loopback ask needs no network: with Wi-Fi off the town is live and the
   bubbles come. Round 29 (Low 9) had the runner ask nothing while `navigator.onLine` was false; the runner takes no such
   input any more, and the page's wiring hands it none. The behaviour is in pageChat.test.ts (a start asks at once; the
   online event's wake() is an ask now); this file pins the wiring, which loads the world and so cannot run under node. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

test("L2: the runner has no online input, and the page's wiring reads no navigator.onLine", () => {
  assert.doesNotMatch(read("../src/state/pageChat.ts"), /\bonline\b\s*[?]?:/, "no `online` option on the runner");
  assert.doesNotMatch(read("../src/state/runtimes.ts"), /navigator\.onLine/, "the wiring hands the runner no online flag");
});

/* Design choice X2 (`inert`, round 72): App's phone test for `coversCorners` is the media query `PHONE_QUERY` of
   state/overlays.ts, "(max-width: 600px)", the width world.css's phone rules switch at (the text view then starts under
   the header rows and covers no corner). Pinned here against the stylesheet: the query's width is the phone rules'. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { coversCorners, PHONE_QUERY } from "../src/state/overlays.ts";

test("X2: the phone query is the max-width of world.css's phone rules", () => {
  const m = /^\(max-width: (\d+)px\)$/.exec(PHONE_QUERY);
  assert.ok(m, `a max-width query: ${PHONE_QUERY}`);
  const css = readFileSync(new URL("../src/styles/world.css", import.meta.url), "utf8");
  // The stylesheet's one other max-width breakpoint (700 px) is not the phone's: the phone rules are the 600 px ones, several of them.
  const phoneRules = css.match(new RegExp(`@media \\(max-width: ${m?.[1]}px\\)`, "g")) ?? [];
  assert.ok(phoneRules.length >= 3, `the stylesheet switches at ${m?.[1]} px in several places: ${phoneRules.length}`);
  assert.equal(m?.[1], "600");
});

test("X2: on a phone the text view covers no corner; on a wider window it does", () => {
  const open = { tour: false, editor: false, jump: false, chat: false, connection: false, settings: false, text: true } as Parameters<typeof coversCorners>[0];
  assert.equal(coversCorners(open, true), false, "a phone: the view starts under the header rows");
  assert.equal(coversCorners(open, false), true);
});

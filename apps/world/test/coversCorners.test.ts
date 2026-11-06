/* Design choice X2 (`inert`, round 72): the text view and the Chat panel start at the top right and cover the right
   toolbar, the chat chip and the camera toolbar, whose buttons stayed in the Tab order under them. While such a sheet
   covers them, App marks the three corners `inert`; the picture is unchanged. The rule is state/overlays.ts's
   `coversCorners`: the Chat panel always (a side sheet on a desktop, the whole screen on a phone); the text view unless
   the window is a phone's (at most 600 px wide), where it starts under the header rows and covers nothing. */
import assert from "node:assert/strict";
import test from "node:test";
import { coversCorners } from "../src/state/overlays.ts";

const open = (kinds: string[]) => ({ tour: false, editor: false, jump: false, chat: false, connection: false, settings: false, text: false, ...Object.fromEntries(kinds.map((k) => [k, true])) }) as Parameters<typeof coversCorners>[0];

test("X2: the text view covers the corners on a desktop, not on a phone", () => {
  assert.equal(coversCorners(open(["text"]), false), true);
  assert.equal(coversCorners(open(["text"]), true), false);
});

test("X2: the Chat panel covers the corners on a desktop and a phone alike", () => {
  assert.equal(coversCorners(open(["chat"]), false), true);
  assert.equal(coversCorners(open(["chat"]), true), true);
});

test("X2: Settings, the jump list, the Connection panel, the tour and the editor leave the corners reachable", () => {
  for (const kind of ["settings", "jump", "connection", "tour", "editor"]) assert.equal(coversCorners(open([kind]), false), false, kind);
  assert.equal(coversCorners(open([]), false), false);
});

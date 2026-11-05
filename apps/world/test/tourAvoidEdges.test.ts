/* The tour's card and the breadcrumb bar (round 65, w1-14), at the edges (round 68, mutation run mx1 over sugg/w1-14):
   a card that touches the bar's edge, or lies wholly to one side of it, does not lie over it and stays where it was;
   an exact fit under the bar is room. Seven of placeStep's clauses could each be off by one, or missing, with every
   test green. */
import assert from "node:assert/strict";
import test from "node:test";
import { placeStep } from "../src/state/tour.ts";

const desktop = { width: 1440, height: 900 };
const card = { width: 352, height: 180 };
const GAP = 12, GUTTER = 16;

test("w1-14: a card whose edge touches the bar's edge does not lie over it, so it stays right under its target", () => {
  // The card's left edge exactly at the bar's right edge (1000): the target's centre lies 176 px right of it.
  const barLeft = { left: 16, top: 56, width: 984, height: 40 };
  const touchingRight = { left: 1121, top: 14, width: 110, height: 28 };
  assert.equal(placeStep(touchingRight, desktop, card).left, 1000, "the card starts where the bar ends");
  assert.deepEqual(placeStep(touchingRight, desktop, card, barLeft), placeStep(touchingRight, desktop, card));
  // The card's right edge exactly at the bar's left edge (600).
  const barRight = { left: 600, top: 56, width: 600, height: 40 };
  const touchingLeft = { left: 369, top: 14, width: 110, height: 28 };
  assert.equal(placeStep(touchingLeft, desktop, card).left + card.width, 600, "the card ends where the bar starts");
  assert.deepEqual(placeStep(touchingLeft, desktop, card, barRight), placeStep(touchingLeft, desktop, card));
  // The card's top exactly at the bar's bottom (96).
  const bar = { left: 16, top: 56, width: 1200, height: 40 };
  const justAbove = { left: 174, top: 56, width: 186, height: 28 };
  assert.equal(placeStep(justAbove, desktop, card).top, 96, "the card starts where the bar ends");
  assert.deepEqual(placeStep(justAbove, desktop, card, bar), placeStep(justAbove, desktop, card));
  // The card's bottom exactly at the bar's top (500), with room under that bar.
  const lowBar = { left: 16, top: 500, width: 1200, height: 40 };
  const higher = { left: 174, top: 280, width: 186, height: 28 };
  assert.equal(placeStep(higher, desktop, card).top + card.height, 500, "the card ends where the bar starts");
  assert.deepEqual(placeStep(higher, desktop, card, lowBar), placeStep(higher, desktop, card));
});

test("w1-14: a card wholly beside the bar, or wholly above it, is not over it: it stays, though there is room under the bar", () => {
  const barRight = { left: 600, top: 56, width: 600, height: 40 };
  const atTheLeft = { left: 20, top: 14, width: 120, height: 36 };
  const left = placeStep(atTheLeft, desktop, card);
  assert.ok(left.left + card.width < barRight.left, "wholly left of the bar");
  assert.deepEqual(placeStep(atTheLeft, desktop, card, barRight), left);
  const lowBar = { left: 16, top: 500, width: 1200, height: 40 };
  const chip = { left: 1180, top: 14, width: 110, height: 28 };
  const above = placeStep(chip, desktop, card);
  assert.ok(above.top + card.height < lowBar.top, "wholly above the bar");
  assert.ok(lowBar.top + lowBar.height + GAP + card.height + GUTTER <= desktop.height, "there is room under the bar");
  assert.deepEqual(placeStep(chip, desktop, card, lowBar), above);
});

test("w1-14: a window exactly as tall as the bar, the gap, the card and the gutter has the room: the card goes under the bar; one pixel less and it stays", () => {
  const bar = { left: 16, top: 56, width: 1200, height: 40 };
  const chip = { left: 1180, top: 14, width: 110, height: 28 };
  const exact = { width: 1440, height: bar.top + bar.height + GAP + card.height + GUTTER };
  assert.equal(placeStep(chip, exact, card, bar).top, bar.top + bar.height + GAP);
  const short = { width: 1440, height: exact.height - 1 };
  assert.equal(placeStep(chip, short, card, bar).top, chip.top + chip.height + GAP);
});

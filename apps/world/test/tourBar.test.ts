/* Round 65 (w1-14): the tour's last card, below the Demo chip in the header, keeps clear of the breadcrumb bar under
   the header (before, it lay over "Town · Jump to /" while it ringed the chip above). */
import assert from "node:assert/strict";
import test from "node:test";
import { placeStep } from "../src/state/tour.ts";

const desktop = { width: 1440, height: 900 };
const card = { width: 352, height: 180 };
// The Demo chip in the header's right half, and the breadcrumb bar right under the header.
const chip = { left: 1180, top: 14, width: 110, height: 28 };
const bar = { left: 0, top: 56, width: 1440, height: 40 };

test("round 65 (w1-14): the card below a header chip goes under the breadcrumb bar, still below its target", () => {
  const placed = placeStep(chip, desktop, card, bar);
  assert.equal(placed.side, "below");
  assert.ok(placed.top >= bar.top + bar.height + 12, `top ${placed.top} is under the bar's bottom ${bar.top + bar.height}`);
  assert.ok(placed.top + card.height + 16 <= desktop.height, "still on the screen");
  // Without the bar the card sat right under the chip, over the bar: the finding.
  const before = placeStep(chip, desktop, card);
  assert.equal(before.top, chip.top + chip.height + 12);
  assert.ok(before.top < bar.top + bar.height, "the old place lay over the bar");
});

test("round 65 (w1-14): a bar the card does not touch changes nothing, and a target below the bar is placed as before", () => {
  const lowBar = { left: 0, top: 700, width: 1440, height: 40 };
  assert.deepEqual(placeStep(chip, desktop, card, lowBar), placeStep(chip, desktop, card));
  const button = { left: 20, top: 200, width: 120, height: 36 };
  assert.deepEqual(placeStep(button, desktop, card, bar), placeStep(button, desktop, card));
  // No room under the bar (a short window): the card stays where it was rather than leaving the screen.
  const short = { width: 1440, height: 280 };
  assert.deepEqual(placeStep(chip, short, card, bar), placeStep(chip, short, card));
});

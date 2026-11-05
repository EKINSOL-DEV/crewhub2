/* Walk finding w2-1 (round 65): with the tour's card and a dialog both open, Escape closes the layer that holds the
   focus (the dialog a person just opened), not the tour; the tour takes Escape only while nothing stands over it. */
import assert from "node:assert/strict";
import test from "node:test";
import { createOverlays, tourTakesEscape } from "../src/state/overlays.ts";

function page() {
  const overlays = createOverlays<{ focus(): void }>({ active: () => null, publish: () => {} });
  return overlays;
}

test("the tour alone takes Escape", () => {
  const overlays = page();
  assert.equal(tourTakesEscape(overlays.state), false, "no tour: nothing to take");
  overlays.startTour();
  assert.equal(tourTakesEscape(overlays.state), true);
});

test("a dialog open over the tour takes Escape first, the tour again once it closed", () => {
  for (const kind of ["connection", "settings", "jump", "chat", "text", "editor"] as const) {
    const overlays = page();
    overlays.startTour();
    overlays.open(kind);
    assert.equal(tourTakesEscape(overlays.state), false, `${kind} open: Escape is the dialog's`);
    assert.equal(overlays.escapeTarget(), kind === "text" ? null : kind, `${kind}: the Escape chain names it (the text view is the view's)`);
    overlays.close(kind);
    assert.equal(tourTakesEscape(overlays.state), true, `${kind} closed: the tour takes Escape again`);
  }
});

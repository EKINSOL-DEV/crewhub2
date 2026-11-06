/* Framing beside the open build sheet (sugg/w6-13, w6-15), through world/sheetFraming.ts: the pure numbers and
   decisions TownScene calls, which no node test reached while they lived in the class (round 70's table, seam 4). Each
   row names the demo regress row that holds the same line in the browser. */
import assert from "node:assert/strict";
import test from "node:test";
import { framedZoom, insideLimits, MIN_ZOOM, portraitInsets, resizeAction, SHEET_BESIDE_MIN_WIDTH, SHEET_MIN_ZOOM, SHEET_RIGHT, SHEET_SIGN_ROOM, sheetChange, sheetLeftInset, sheetOverhang } from "../src/world/sheetFraming.ts";

test("the sheet's numbers: its right edge with a gap, where it stops lying beside the town, the room kept for signs, the two zoom floors", () => {
  assert.equal(SHEET_RIGHT, 348);
  assert.equal(SHEET_BESIDE_MIN_WIDTH, 600);
  assert.equal(SHEET_SIGN_ROOM, 60);
  assert.equal(MIN_ZOOM, 0.6);
  assert.equal(SHEET_MIN_ZOOM, 0.25);
});

test("a portrait frame drops the side insets, except a left one that is the open sheet, which stays (the 601 px row)", () => {
  assert.deepEqual(portraitInsets({ top: 156, bottom: 76, left: 12, right: 60 }), { top: 156, bottom: 76, left: 0, right: 0 });
  assert.deepEqual(portraitInsets({ top: 104, bottom: 84, left: 348, right: 76 }), { top: 104, bottom: 84, left: 348, right: 0 });
  assert.deepEqual(portraitInsets({ top: 104, bottom: 84, left: 408, right: 76 }), { top: 104, bottom: 84, left: 408, right: 0 });
  assert.deepEqual(portraitInsets({ top: 104, bottom: 84, left: 347, right: 76 }), { top: 104, bottom: 84, left: 0, right: 0 });
});

test("the left inset beside the open sheet: the sheet's edge plus sign room that grows a fifth of the width past 600 px, capped at 60 (the beside-the-town row)", () => {
  assert.equal(sheetLeftInset(1440, false, 24), 24, "closed: the chrome's left");
  assert.equal(sheetLeftInset(1440, undefined, 24), 24, "never opened: the chrome's left");
  assert.equal(sheetLeftInset(600, true, 24), 24, "at 600 px the sheet lies along the bottom: the chrome's left");
  assert.equal(sheetLeftInset(601, true, 24), 348 + 0.2, "from 601 px the sheet lies beside: its edge and a fifth of the width past 600");
  assert.equal(sheetLeftInset(800, true, 24), 348 + 40);
  assert.equal(sheetLeftInset(900, true, 24), 348 + 60, "the sign room reaches its cap at 900 px");
  assert.equal(sheetLeftInset(1440, true, 24), 348 + 60, "and stays there");
});

test("a frame's zoom: clamped above a person's limit with the sheet closed, above the sheet's lower floor with it open, and never above the controls' maximum; the zoom-out limit follows the frame down to a person's (the Zoom out comes back row)", () => {
  assert.deepEqual(framedZoom(0.4, false, 16), { zoom: 0.6, limit: 0.6 });
  assert.deepEqual(framedZoom(0.4, undefined, 16), { zoom: 0.6, limit: 0.6 });
  assert.deepEqual(framedZoom(0.4, true, 16), { zoom: 0.4, limit: 0.4 });
  assert.deepEqual(framedZoom(0.1, true, 16), { zoom: 0.25, limit: 0.25 });
  assert.deepEqual(framedZoom(0.1, false, 16), { zoom: 0.6, limit: 0.6 });
  assert.deepEqual(framedZoom(2.5, true, 16), { zoom: 2.5, limit: 0.6 }, "a frame above a person's limit leaves the limit theirs");
  assert.deepEqual(framedZoom(2.5, false, 16), { zoom: 2.5, limit: 0.6 });
  assert.deepEqual(framedZoom(40, true, 16), { zoom: 16, limit: 0.6 }, "never past the controls' maximum");
  assert.deepEqual(framedZoom(40, false, 4), { zoom: 4, limit: 0.6 });
  assert.deepEqual(framedZoom(0.6, true, 16), { zoom: 0.6, limit: 0.6 });
  assert.deepEqual(framedZoom(0.25, true, 16), { zoom: 0.25, limit: 0.25 });
  // The controls' maximum is never under 4 (TownScene's resize), so this pins only the clamp's promise: three's
  // MathUtils.clamp line for line, where a floor above the ceiling gives the floor.
  assert.deepEqual(framedZoom(1, false, 0.5), { zoom: 0.6, limit: 0.6 }, "a ceiling under the floor: the floor wins, as three's clamp has it");
});

test("the sheet closed on a camera a person moved: a target off the ground or a zoom under a person's limit eases back inside, and a camera inside stays (the eases-inside row)", () => {
  const ground = { minX: -10, maxX: 30, minZ: -5, maxZ: 25 };
  assert.equal(insideLimits({ x: 0, y: 0.5, z: 0 }, 1, ground), null, "inside and above the limit: nothing to do");
  assert.equal(insideLimits({ x: -10, y: 0, z: 25 }, 0.6, ground), null, "on the edge and on the limit: nothing to do");
  assert.deepEqual(insideLimits({ x: -14, y: 0.5, z: 0 }, 1, ground), { target: { x: -10, y: 0.5, z: 0 }, zoom: 1 }, "past the left edge: back onto it, the height kept");
  assert.deepEqual(insideLimits({ x: 0, y: 0, z: 31 }, 1, ground), { target: { x: 0, y: 0, z: 25 }, zoom: 1 }, "past the far edge");
  assert.deepEqual(insideLimits({ x: 35, y: 0, z: -9 }, 1, ground), { target: { x: 30, y: 0, z: -5 }, zoom: 1 }, "past a corner: both");
  assert.deepEqual(insideLimits({ x: 0, y: 0, z: 0 }, 0.3, ground), { target: { x: 0, y: 0, z: 0 }, zoom: 0.6 }, "zoomed out past a person's limit: up to it");
  assert.deepEqual(insideLimits({ x: -14, y: 0, z: 0 }, 0.3, ground), { target: { x: -10, y: 0, z: 0 }, zoom: 0.6 }, "both at once");
  assert.equal(insideLimits({ x: 0, y: 0, z: 0 }, 2, ground), null, "zoomed in: a person's limit is a floor only");
});

test("the pan clamp's overhang beside the sheet: half the sheet's width in world units at the current zoom, by the canvas height (the every-plot-clear row)", () => {
  assert.equal(sheetOverhang(20, 1, 900), ((20 / 1) * 348) / 2 / 900);
  assert.equal(sheetOverhang(20, 2, 900), sheetOverhang(20, 1, 900) / 2, "zoomed in twice, half the overhang");
  assert.equal(sheetOverhang(40, 1, 900), sheetOverhang(20, 1, 900) * 2, "a town twice as tall, twice the overhang");
  assert.equal(sheetOverhang(20, 1, 450), sheetOverhang(20, 1, 900) * 2, "a canvas half as tall, twice the overhang");
  assert.equal(sheetOverhang(20, 1, 1), (20 * 348) / 2, "one pixel tall: half the sheet's width in world units at zoom 1");
  assert.equal(sheetOverhang(20, 1, 0), sheetOverhang(20, 1, 1), "a canvas without height counts as one pixel tall");
  assert.equal(sheetOverhang(20, 1, 0.5), sheetOverhang(20, 1, 1));
});

test("the sheet opening or closing: nothing when it did not change; a placed camera stays when it opens and eases inside when it closes; a camera on a frame is framed again, the building or the outside (the goes-back and stays rows)", () => {
  assert.equal(sheetChange(false, false, false, null), null);
  assert.equal(sheetChange(true, true, false, "b-1"), null);
  assert.equal(sheetChange(undefined, false, false, null), null, "never opened and closed are the same state");
  assert.equal(sheetChange(false, undefined, true, "b-1"), null);
  assert.equal(sheetChange(undefined, true, true, null), null, "opens on a placed camera: it stays");
  assert.equal(sheetChange(false, true, true, "b-1"), null);
  assert.equal(sheetChange(true, false, true, null), "intoLimits", "closes on a placed camera: back inside a person's limits");
  assert.equal(sheetChange(true, undefined, true, "b-1"), "intoLimits");
  assert.equal(sheetChange(false, true, false, "b-1"), "frameBuilding", "opens on a framed building: framed again beside it");
  assert.equal(sheetChange(true, false, false, "b-1"), "frameBuilding", "closes on a framed building: framed again without it");
  assert.equal(sheetChange(false, true, false, null), "frameOutside", "opens outside: the outside framed again");
  assert.equal(sheetChange(true, false, false, null), "frameOutside");
});

test("a resize: the frame beside the open sheet is framed again, unless the camera is placed, a walk is on or a figure is followed; closed, nothing (the resize rows)", () => {
  assert.equal(resizeAction(false, false, false, false, null), null, "closed");
  assert.equal(resizeAction(undefined, false, false, false, "b-1"), null, "never opened");
  assert.equal(resizeAction(true, true, false, false, null), null, "placed: a camera a person moved stays through a resize");
  assert.equal(resizeAction(true, false, true, false, null), null, "walking: the camera follows the visitor");
  assert.equal(resizeAction(true, false, false, true, null), null, "following a figure");
  assert.equal(resizeAction(true, false, false, false, "b-1"), "frameBuilding");
  assert.equal(resizeAction(true, false, false, false, null), "frameOutside");
});

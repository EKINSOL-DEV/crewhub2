import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { INTRODUCTION_URL, placeStep, readTourDone, tourShouldStart, tourSteps, TOUR_KEY, writeTourDone } from "../src/state/tour.ts";

const INTRODUCTION = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "docs", "INTRODUCTION.md"), "utf8");

test("the steps: six, in the order the person meets them, one picture-free sentence each, the chat and the chip by mode", () => {
  for (const mode of ["demo", "live"] as const) {
    const steps = tourSteps(mode);
    assert.deepEqual(
      steps.map((s) => s.id),
      ["town", "building", "card", "chat", "text", "connection"],
    );
    assert.ok(steps.length >= 5 && steps.length <= 7);
    for (const step of steps) {
      assert.ok(step.title.length > 0 && step.title.length < 40, step.title);
      assert.match(step.text, /[.…]$/, `${step.id} ends as a sentence`);
      assert.ok(!/!\[/.test(step.text), "no picture");
      assert.ok(step.text.split(/(?<=[.!?])\s+(?=[A-Z])/).length <= 2, `${step.id}: one sentence (a semicolon is allowed): ${step.text}`);
      assert.ok(step.targetName.length > 0);
    }
  }
  assert.equal(tourSteps("demo")[3]!.target, ".world-chat");
  assert.equal(tourSteps("live")[3]!.target, ".chat-open");
  assert.equal(tourSteps("demo")[5]!.title, "The Demo chip");
  assert.equal(tourSteps("live")[5]!.title, "The Connection panel");
  assert.equal(tourSteps("live")[5]!.target, "button.connection-chip");
  assert.equal(tourSteps("live")[4]!.target, null, "the text view is opened with a key, nothing on the screen is highlighted");
});

test("the words are the introduction's, shorter: each step's key phrase stands in docs/INTRODUCTION.md", () => {
  const phrases: Record<string, string> = {
    town: "One building per project",
    building: "the lead sits in the office",
    card: "its latest progress line",
    chat: "scripted chat dock",
    text: "Every fact the scene shows is also a sentence",
    connection: "scripted",
  };
  for (const step of tourSteps("demo")) {
    const phrase = phrases[step.id]!;
    assert.ok(step.text.includes(phrase), `${step.id} says "${phrase}"`);
    assert.ok(INTRODUCTION.includes(phrase), `the introduction says "${phrase}"`);
  }
  assert.ok(tourSteps("live")[3]!.text.includes("speech bubble") && INTRODUCTION.includes("speech bubble"));
  assert.ok(tourSteps("live")[5]!.text.includes("Connection panel") && INTRODUCTION.includes("Connection panel"));
  assert.match(INTRODUCTION_URL, /^https:\/\/github\.com\/.*\/docs\/INTRODUCTION\.md$/);
});

test("the flag: never again after Skip or Done, per browser; a storage that throws shows the tour again", () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  assert.equal(readTourDone(storage), false);
  writeTourDone(storage);
  assert.equal(store.get(TOUR_KEY), "done");
  assert.equal(readTourDone(storage), true);
  const broken = {
    getItem: () => {
      throw new Error("private window");
    },
    setItem: () => {
      throw new Error("private window");
    },
  };
  assert.equal(readTourDone(broken), false);
  assert.doesNotThrow(() => writeTourDone(broken));
  assert.equal(readTourDone(null), false, "no storage at all: the tour shows");
});

test("when the tour starts by itself: a fresh browser, no screen, no dialog, not a tool's browser; the URL flag decides first", () => {
  const fresh = { done: false, webdriver: false, search: "", screenShown: false, dialogOpen: false, graphicsFailed: false };
  assert.equal(tourShouldStart(fresh), true);
  assert.equal(tourShouldStart({ ...fresh, done: true }), false, "seen through to Skip or Done");
  assert.equal(tourShouldStart({ ...fresh, webdriver: true }), false, "a tool's browser (the regress, the shots) never gets it");
  assert.equal(tourShouldStart({ ...fresh, screenShown: true }), false, "a Connect screen or the pairing page");
  assert.equal(tourShouldStart({ ...fresh, dialogOpen: true }), false, "a dialog is open");
  assert.equal(tourShouldStart({ ...fresh, graphicsFailed: true }), false);
  assert.equal(tourShouldStart({ ...fresh, done: true, webdriver: true, search: "?tour=on" }), true, "asked for: the flag and the tool's browser do not count");
  assert.equal(tourShouldStart({ ...fresh, search: "?tour=on", dialogOpen: true }), false, "asked for, but never over a dialog");
  assert.equal(tourShouldStart({ ...fresh, search: "?tour=on", screenShown: true }), false, "asked for, but never under a Connect screen");
  assert.equal(tourShouldStart({ ...fresh, search: "?tour=off" }), false, "refused");
  assert.equal(tourShouldStart({ ...fresh, search: "?rooms=three&tour=on" }), true);
});

test("the card never covers what it describes: below the element, else above, else beside; a phone pins it to the far edge", () => {
  const desktop = { width: 1440, height: 900 };
  const card = { width: 352, height: 180 };
  // A small button at the top left: the card goes below it, centred on it, kept inside the gutter.
  const button = { left: 20, top: 60, width: 120, height: 36 };
  const below = placeStep(button, desktop, card);
  assert.equal(below.side, "below");
  assert.equal(below.top, 60 + 36 + 12);
  assert.equal(below.left, 16, "clamped to the gutter");
  // A chip at the bottom right: above it.
  const chip = { left: 1300, top: 850, width: 120, height: 32 };
  const above = placeStep(chip, desktop, card);
  assert.equal(above.side, "above");
  assert.equal(above.top, 850 - 12 - 180);
  assert.ok(above.left + card.width <= 1440 - 16);
  // The whole stage: no room below or above, the card sits low, over the stage's own lower part.
  const stage = { left: 0, top: 0, width: 1440, height: 900 };
  assert.equal(placeStep(stage, desktop, card).side, "centre");
  assert.equal(placeStep(stage, desktop, card).top, 900 - 180 - 16);
  // No element: centred.
  const centred = placeStep(null, desktop, card);
  assert.equal(centred.side, "centre");
  assert.equal(centred.left, (1440 - 352) / 2);
  // A phone: the card spans the width at the bottom, or at the top when the element is in the lower half.
  const phone = { width: 375, height: 812 };
  const narrow = { width: 343, height: 200 };
  const top = placeStep({ left: 10, top: 20, width: 60, height: 36 }, phone, narrow);
  assert.equal(top.side, "below");
  assert.equal(top.top, 812 - 200 - 16);
  const bottom = placeStep({ left: 200, top: 760, width: 120, height: 32 }, phone, narrow);
  assert.equal(bottom.side, "above");
  assert.equal(bottom.top, 16);
  assert.equal(placeStep(null, phone, narrow).top, 812 - 200 - 16);
  for (const p of [top, bottom]) {
    assert.ok(p.left >= 16 && p.left + narrow.width <= 375 - 16, "inside the phone's gutters");
  }
});

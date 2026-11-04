/* The page's overlays (state/overlays.ts) through their interface, with fake elements for the focus: which are open,
   where the focus returns, what Escape closes. Round 60, pg-P2. The browser's pins are tools/a11y.mjs's focus checks (Escape
   closes the panel and the focus is back on the chip) and regress's Escape chains. */
import assert from "node:assert/strict";
import test from "node:test";
import { createOverlays, dialogIsOpen, ESCAPE_ORDER, type OverlayKind, type OverlaysState } from "../src/state/overlays.ts";

/** An element that records being focused. */
function element(name: string, log: string[]) {
  return { name, focus: () => void log.push(name) };
}
type Fake = ReturnType<typeof element>;

function page() {
  const focused: string[] = [];
  const at = { active: null as Fake | null };
  const heard: OverlaysState<Fake>[] = [];
  const overlays = createOverlays<Fake>({ active: () => at.active, publish: (s) => void heard.push(s) });
  const on = (name: string) => (at.active = element(name, focused));
  return { overlays, focused, at, heard, on };
}

test("every overlay opens and closes on its own; each change is published once, a move that changes nothing is not", () => {
  const { overlays, heard } = page();
  for (const kind of ["tour", "editor", "jump", "chat", "connection", "settings", "text"] as OverlayKind[]) {
    assert.equal(overlays.state.open[kind], false);
    overlays.open(kind);
    assert.equal(overlays.state.open[kind], true, kind);
    assert.equal(heard.at(-1), overlays.state);
    const count = heard.length;
    overlays.open(kind);
    assert.equal(heard.length, count, "open again: nothing new");
    overlays.dismiss(kind);
    assert.equal(overlays.state.open[kind], false, kind);
    assert.equal(heard.length, count + 1);
    overlays.dismiss(kind);
    assert.equal(heard.length, count + 1, "closed again: nothing new");
  }
});

test("each close returns the focus to the element that opened it; no opener, no focus", () => {
  for (const kind of ["jump", "settings", "text", "connection", "chat"] as OverlayKind[]) {
    const { overlays, focused, on, at } = page();
    on(`${kind} button`);
    overlays.open(kind);
    on("somewhere inside");
    overlays.close(kind);
    assert.deepEqual(focused, [`${kind} button`], kind);
    assert.equal(overlays.state.open[kind], false);
    at.active = null;
    overlays.open(kind);
    focused.length = 0;
    overlays.close(kind);
    assert.deepEqual(focused, [], `${kind}: nothing had the focus`);
  }
});

test("a close that finds its overlay already closed still returns the focus, and the return point stays for it (as the page's dialogs always did)", () => {
  const { overlays, focused, on } = page();
  on("chip");
  overlays.open("connection");
  overlays.close("connection");
  overlays.close("connection");
  assert.deepEqual(focused, ["chip", "chip"]);
});

test("the prop editor and the tour return nothing themselves; a dismissed overlay leaves the focus alone (the jump list on the chosen entry, where the scene takes it)", () => {
  const { overlays, focused, on } = page();
  on("palette");
  overlays.open("editor");
  overlays.close("editor");
  overlays.open("tour");
  overlays.close("tour");
  on("search");
  overlays.open("jump");
  overlays.dismiss("jump");
  assert.deepEqual(focused, []);
});

test("KEPT AS IT IS, a decision for Nicky: Settings, then the jump list, then Escape twice returns to the element inside Settings both times, not to the Settings button, because the four share one return slot; a true stack would be one small change here", () => {
  const { overlays, focused, on } = page();
  on("Settings button");
  overlays.open("settings");
  on("a control inside Settings");
  overlays.open("jump");
  assert.equal(overlays.escapeTarget(), "jump");
  overlays.close("jump");
  assert.equal(overlays.escapeTarget(), "settings");
  overlays.close("settings");
  assert.deepEqual(focused, ["a control inside Settings", "a control inside Settings"]);
  assert.equal(overlays.escapeTarget(), null);
});

test("the chat keeps its own return: opening another overlay over it leaves it", () => {
  const { overlays, focused, on } = page();
  on("chat chip");
  overlays.open("chat");
  on("in the panel");
  overlays.open("connection");
  overlays.close("connection");
  overlays.close("chat");
  assert.deepEqual(focused, ["in the panel", "chat chip"]);
});

test("Escape's order is fixed, not the order of opening: the editor, the jump list, the chat, the Connection panel, Settings; the tour and the text view are not in it", () => {
  assert.deepEqual(ESCAPE_ORDER, ["editor", "jump", "chat", "connection", "settings"]);
  const { overlays } = page();
  assert.equal(overlays.escapeTarget(), null);
  for (const kind of [...ESCAPE_ORDER].reverse()) overlays.open(kind);
  const closed: (OverlayKind | null)[] = [];
  for (let target = overlays.escapeTarget(); target !== null; target = overlays.escapeTarget()) {
    closed.push(target);
    overlays.dismiss(target);
  }
  assert.deepEqual(closed, ["editor", "jump", "chat", "connection", "settings"]);
  overlays.open("settings");
  overlays.open("editor");
  assert.equal(overlays.escapeTarget(), "editor", "opened last or not");
  overlays.dismiss("editor");
  overlays.dismiss("settings");
  overlays.open("text");
  overlays.open("tour");
  assert.equal(overlays.escapeTarget(), null, "the tour goes first in App's key handler, the text view by the view's chain");
});

test("the tour's return: the Settings button when Settings opened it (Settings closes without taking the focus); nothing from elsewhere; by itself it changes nothing", () => {
  const { overlays, focused, on } = page();
  on("Settings button");
  overlays.open("settings");
  on("Show the introduction");
  overlays.openTour();
  assert.equal(overlays.state.open.settings, false, "Settings closes first");
  assert.equal(overlays.state.open.tour, true);
  assert.equal(overlays.state.tourReturn?.name, "Settings button");
  assert.deepEqual(focused, [], "no focus move: the tour's card takes it");
  overlays.close("tour");
  assert.equal(overlays.state.tourReturn?.name, "Settings button", "kept until the next opening");
  overlays.startTour();
  assert.equal(overlays.state.open.tour, true);
  assert.equal(overlays.state.tourReturn?.name, "Settings button", "by itself: as it was");
  overlays.dismiss("tour");
  overlays.openTour();
  assert.equal(overlays.state.tourReturn, null, "the ? menu, Settings closed: the card has nowhere of ours to return to");
});

test("a dialog is open for the tour's wait: every overlay but the tour itself", () => {
  const { overlays } = page();
  assert.equal(dialogIsOpen(overlays.state), false);
  overlays.startTour();
  assert.equal(dialogIsOpen(overlays.state), false);
  overlays.dismiss("tour");
  for (const kind of ["settings", "jump", "connection", "chat", "text", "editor"] as OverlayKind[]) {
    overlays.open(kind);
    assert.equal(dialogIsOpen(overlays.state), true, kind);
    overlays.dismiss(kind);
    assert.equal(dialogIsOpen(overlays.state), false, kind);
  }
});

/* Round 64 (w5-8): the copied chat dock disables its message box and its Send button while a message is sent, so a
   Send by keyboard drops the focus to the document body. state/dockFocus.ts puts it back once the box is enabled
   again. The guard is run over a small fake document (the dock's form, its textarea, an injected observer), as the
   round 32 media hooks were pinned without a browser. */
import assert from "node:assert/strict";
import test from "node:test";
import { COMPOSE_FORM, attachSendFocusGuard } from "../src/state/dockFocus.ts";

type Listener = (event: { target: unknown }) => void;

/** A document with one compose form: the listeners it holds, where the focus is, and the observers attached. */
function fakeDock() {
  const listeners = new Map<string, Set<Listener>>();
  const body = { tagName: "BODY" };
  const field = { tagName: "TEXTAREA", disabled: false, focused: 0, focus() { this.focused += 1; doc.activeElement = field; } };
  const button = { tagName: "BUTTON", disabled: false };
  const form = {
    tagName: "FORM",
    closest: (selector: string) => (selector === COMPOSE_FORM ? form : null),
    querySelector: (selector: string) => (selector === "textarea" ? field : null),
  };
  const other = { tagName: "FORM", closest: () => null, querySelector: () => null };
  const doc = {
    body,
    activeElement: button as unknown,
    addEventListener(type: string, fn: Listener) { (listeners.get(type) ?? listeners.set(type, new Set()).get(type))!.add(fn); },
    removeEventListener(type: string, fn: Listener) { listeners.get(type)?.delete(fn); },
  };
  const observers: { target: unknown; onChange: () => void; stopped: boolean }[] = [];
  const observeDisabled = (target: unknown, onChange: () => void) => {
    const entry = { target, onChange, stopped: false };
    observers.push(entry);
    return () => { entry.stopped = true; };
  };
  const submit = (target: unknown) => { for (const fn of listeners.get("submit") ?? []) fn({ target }); };
  const live = () => observers.filter((o) => !o.stopped);
  return { doc, body, field, button, form, other, observers, observeDisabled, submit, live, listeners };
}

test("after Send the focus comes back to the message box once it is enabled again, and the observer stops", () => {
  const d = fakeDock();
  const detach = attachSendFocusGuard(d.doc as unknown as Document, { observeDisabled: d.observeDisabled as never });
  d.submit(d.form);
  assert.equal(d.live().length, 1, "one observer on the form after the submit");
  assert.equal(d.live()[0]?.target, d.form, "it watches the compose form");
  // The send starts: both controls disabled, the focus falls to the body.
  d.field.disabled = true; d.button.disabled = true; d.doc.activeElement = d.body;
  d.live()[0]?.onChange();
  assert.equal(d.field.focused, 0, "nothing while the box is disabled");
  // The send is done: the box is enabled again (the button stays disabled, the draft being empty).
  d.field.disabled = false;
  d.live()[0]?.onChange();
  assert.equal(d.field.focused, 1, "the box is focused once it is enabled");
  assert.equal(d.doc.activeElement, d.field);
  assert.equal(d.live().length, 0, "the observer stopped after the focus came back");
  detach();
  assert.equal(d.listeners.get("submit")?.size ?? 0, 0, "detach removes the listener");
});

test("the focus is not taken from something the person moved to meanwhile, nor from a disabled-then-enabled box the person never left", () => {
  const d = fakeDock();
  attachSendFocusGuard(d.doc as unknown as Document, { observeDisabled: d.observeDisabled as never });
  d.submit(d.form);
  d.field.disabled = true; d.doc.activeElement = { tagName: "BUTTON", name: "close" };
  d.live()[0]?.onChange();
  d.field.disabled = false;
  d.live()[0]?.onChange();
  assert.equal(d.field.focused, 0, "the person is on the close button: left there");
  assert.equal(d.live().length, 0, "the observer still stops: the send is over");
});

test("the button alone disabled (the box never was) still brings the focus back from the body on the next change", () => {
  const d = fakeDock();
  attachSendFocusGuard(d.doc as unknown as Document, { observeDisabled: d.observeDisabled as never });
  d.submit(d.form);
  d.button.disabled = true; d.doc.activeElement = d.body;
  d.live()[0]?.onChange();
  assert.equal(d.field.focused, 1);
});

test("a submit of another form is not the dock's: no observer; a second submit replaces the first observer", () => {
  const d = fakeDock();
  attachSendFocusGuard(d.doc as unknown as Document, { observeDisabled: d.observeDisabled as never });
  d.submit(d.other);
  assert.equal(d.observers.length, 0);
  d.submit(d.form);
  d.submit(d.form);
  assert.equal(d.observers.length, 2);
  assert.equal(d.live().length, 1, "the first observer was stopped by the second submit");
});

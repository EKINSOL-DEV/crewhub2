/* loops' own cases for the send chord (crewhub-loops c7f9d679, sendChord.test.ts), as node tests (round 69, w5-10). */
import assert from "node:assert/strict";
import { test } from "node:test";
import { isSendChord } from "../src/components/primitives/sendChord.ts";

const key = (over: Partial<Parameters<typeof isSendChord>[0]> = {}) => ({ key: "Enter", ctrlKey: false, metaKey: false, ...over });

test("Ctrl+Enter and Cmd+Enter send", () => {
  assert.equal(isSendChord(key({ ctrlKey: true })), true);
  assert.equal(isSendChord(key({ metaKey: true })), true);
});

test("plain Enter, Shift+Enter and Alt+Enter keep their meaning (a new line)", () => {
  assert.equal(isSendChord(key()), false);
  assert.equal(isSendChord(key({ shiftKey: true })), false);
  assert.equal(isSendChord(key({ altKey: true })), false);
  assert.equal(isSendChord(key({ ctrlKey: true, shiftKey: true })), false);
});

test("other keys with Ctrl do not send", () => {
  assert.equal(isSendChord(key({ key: "a", ctrlKey: true })), false);
  assert.equal(isSendChord(key({ key: "Tab", metaKey: true })), false);
});

test("an IME composition never sends, by isComposing or the legacy keyCode 229", () => {
  assert.equal(isSendChord(key({ ctrlKey: true, isComposing: true })), false);
  assert.equal(isSendChord(key({ ctrlKey: true, nativeEvent: { isComposing: true } })), false);
  assert.equal(isSendChord(key({ ctrlKey: true, keyCode: 229 })), false);
});

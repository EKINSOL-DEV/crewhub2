/* The send hint's platform (round 69, w5-10, after rd2's review): `detectPlatform` says mac for a Mac, an iPhone and an iPad,
   windows for Windows, and null for the rest, so the hint reads "⌘ Enter" where ⌘ exists and "Ctrl+Enter" elsewhere. Loops'
   detector (CL-181, crewhub-loops c7f9d679), ported word for word in components/settings/testNotification.ts. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { detectPlatform } from "../src/components/settings/testNotification.ts";

test("a Mac, an iPhone and an iPad are mac, whatever the case", () => {
  assert.equal(detectPlatform("MacIntel"), "mac");
  assert.equal(detectPlatform("macOS"), "mac");
  assert.equal(detectPlatform("iPhone"), "mac");
  assert.equal(detectPlatform("iPad"), "mac");
});

test("Windows is windows; Linux, Android, an empty string and undefined are unknown", () => {
  assert.equal(detectPlatform("Win32"), "windows");
  assert.equal(detectPlatform("Windows"), "windows");
  assert.equal(detectPlatform("Linux x86_64"), null);
  assert.equal(detectPlatform("Android"), null);
  assert.equal(detectPlatform(""), null);
  assert.equal(detectPlatform(undefined), null);
});

/* Design choice H3 (`stored-only`, round 72): the Connection panel's note on a rejected key read from the old default
   file says where the key comes from, that the host never deletes that file, and what to do: remove the file, or paste
   a new key. It names neither the file's path nor its variable (the host's bundle rule). Pinned word for word here:
   round 73's mutation run cut the sentence with every test green. The strings are read from en.ts as connectOlder does
   (the i18n index is Vite's: an extensionless import). */
import assert from "node:assert/strict";
import test from "node:test";
import { EN } from "../src/i18n/en.ts";

test("H3: the default-file key's note says the file, that the host never deletes it, and the two ways out", () => {
  const note = EN["world.connection.panel.keyFile"];
  assert.equal(note, "This key comes from the default key file, which the host never deletes. Remove that file, or paste a new key.");
  assert.doesNotMatch(note ?? "", /CREWHUB_WORLD|\.key\b|\//, "neither the variable nor a path");
});

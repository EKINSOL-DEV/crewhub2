import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createKeyStore } from "../src/keyStore.ts";

describe("the stored key", () => {
  it("lives in the host's own folder, 0700 and 0600, whole, and can be forgotten", () => {
    const base = mkdtempSync(path.join(tmpdir(), "chw-store-"));
    try {
      const dir = path.join(base, "crewhub-world");
      const store = createKeyStore(dir);
      store.save("chl_test_key_0123456789");
      assert.equal(statSync(dir).mode & 0o777, 0o700);
      assert.equal(statSync(store.file).mode & 0o777, 0o600);
      assert.equal(readFileSync(store.file, "utf8"), "chl_test_key_0123456789\n");
      store.save("chl_other_key_0123456789");
      assert.equal(readFileSync(store.file, "utf8"), "chl_other_key_0123456789\n", "replaced whole");
      store.forget();
      assert.throws(() => statSync(store.file));
      store.forget();
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});

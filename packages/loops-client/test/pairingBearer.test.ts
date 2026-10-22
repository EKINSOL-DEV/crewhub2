import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { PAIRING_KEY, bearerHeaders, clearPairing, readPairing, storePairing, takeFragmentToken, tokenFromHash } from "../src/pairingBearer.ts";

const TOKEN = "A".repeat(43);

/** A sessionStorage for the test. */
function fakeStorage() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k), map };
}

describe("the tab's pairing bearer", () => {
  afterEach(() => {
    delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
  });

  it("reads the token out of the fragment only, in the pair= part, and takes it out of the URL without a reload", () => {
    assert.equal(tokenFromHash(`#pair=${TOKEN}`), TOKEN);
    assert.equal(tokenFromHash(`pair=${TOKEN}`), TOKEN);
    assert.equal(tokenFromHash(`#x=1&pair=${TOKEN}&y=2`), TOKEN);
    assert.equal(tokenFromHash(`#pair=${TOKEN.slice(1)}`), null, "not 43 characters");
    assert.equal(tokenFromHash(`#repair=${TOKEN}`), null);
    assert.equal(tokenFromHash(""), null);
    const replaced: string[] = [];
    const token = takeFragmentToken({ hash: `#pair=${TOKEN}`, pathname: "/", search: "?source=live" }, { replaceState: (_d, _u, url) => void replaced.push(url) });
    assert.equal(token, TOKEN);
    assert.deepEqual(replaced, ["/?source=live"], "the fragment is gone, path and query stay");
    assert.equal(takeFragmentToken({ hash: "", pathname: "/", search: "" }, { replaceState: (_d, _u, url) => void replaced.push(url) }), null);
    assert.equal(replaced.length, 1, "nothing to take, nothing replaced");
  });

  it("keeps the bearer in this tab's sessionStorage and sends it in the x-world-pair header; nothing without one", () => {
    assert.deepEqual(bearerHeaders(), {}, "no storage at all (a test, a worker): no header, no throw");
    const storage = fakeStorage();
    (globalThis as { sessionStorage?: unknown }).sessionStorage = storage;
    assert.equal(readPairing(), null);
    assert.deepEqual(bearerHeaders(), {});
    storePairing("id.mac");
    assert.equal(storage.map.get(PAIRING_KEY), "id.mac");
    assert.deepEqual(bearerHeaders(), { "x-world-pair": "id.mac" });
    clearPairing();
    assert.deepEqual(bearerHeaders(), {});
  });
});

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createArchiveStore, normaliseSlugs, parseArchiveMemory } from "../src/archiveStore.ts";

describe("the archive memory file", () => {
  it("lives beside the key, 0700 and 0600, written whole, sorted and unique; unreadable or foreign content is no memory", () => {
    const base = mkdtempSync(path.join(tmpdir(), "chw-archive-"));
    try {
      const dir = path.join(base, "crewhub-world");
      const store = createArchiveStore(dir);
      assert.equal(store.read(), null, "no file yet");
      store.save({ slugs: ["ops-tooling", "atlas", "ops-tooling"], at: "2026-10-21T03:00:00.000Z", target: "http://127.0.0.1:8291" });
      assert.equal(statSync(dir).mode & 0o777, 0o700);
      assert.equal(statSync(store.file).mode & 0o777, 0o600);
      assert.deepEqual(JSON.parse(readFileSync(store.file, "utf8")), { v: 1, slugs: ["atlas", "ops-tooling"], at: "2026-10-21T03:00:00.000Z", target: "http://127.0.0.1:8291" });
      assert.deepEqual(store.read(), { slugs: ["atlas", "ops-tooling"], at: "2026-10-21T03:00:00.000Z", target: "http://127.0.0.1:8291" });
      store.save({ slugs: [], at: "2026-10-21T03:05:00.000Z" });
      assert.deepEqual(store.read(), { slugs: [], at: "2026-10-21T03:05:00.000Z" }, "replaced whole: a restored project is gone");
      writeFileSync(store.file, "{not json");
      assert.equal(store.read(), null);
      writeFileSync(store.file, JSON.stringify({ v: 2, slugs: ["x"] }));
      assert.equal(store.read(), null, "a version this host does not know");
      // A slug that is no path segment (an edited file) is dropped on read and on write (review F8): it would make
      // every snapshot's `GET /api/projects/{slug}` fall at the allow-list.
      writeFileSync(store.file, JSON.stringify({ v: 1, slugs: ["a/b", "crewhub", "", "..", "-x", "ok.slug_1", "a".repeat(129)], at: "2026-10-22T00:00:00Z" }));
      assert.deepEqual(store.read()?.slugs, ["crewhub", "ok.slug_1"]);
      store.save({ slugs: ["a/b", "crewhub"], at: "2026-10-22T00:00:00Z" });
      assert.deepEqual(JSON.parse(readFileSync(store.file, "utf8")).slugs, ["crewhub"]);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("parses strictly: slugs are strings, the rest optional", () => {
    assert.deepEqual(parseArchiveMemory('{"v":1,"slugs":["b","a",3,""],"at":"t"}'), { slugs: ["a", "b"], at: "t" });
    assert.deepEqual(parseArchiveMemory('{"v":1,"slugs":[]}'), { slugs: [], at: "" });
    assert.equal(parseArchiveMemory('{"v":1}'), null);
    assert.equal(parseArchiveMemory("[]"), null);
    assert.deepEqual(normaliseSlugs(new Set(["b", "a", "b"])), ["a", "b"]);
  });
});

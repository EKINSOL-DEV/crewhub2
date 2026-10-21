import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildCommand, distState, freshness, stampOf, worldSources } from "../src/build.ts";

const at = (ms: number) => ({ path: "x", mtimeMs: ms });

describe("the build freshness check", () => {
  it("a missing dist, or a source newer than it, means a build; otherwise it is fresh", () => {
    assert.equal(freshness({ distMtimeMs: null, sources: [], stamp: null }).fresh, false);
    const older = freshness({ distMtimeMs: 1000, sources: [at(900), { path: "apps/world/src/a.ts", mtimeMs: 1500 }], stamp: null });
    assert.equal(older.fresh, false);
    assert.match(older.reason, /apps\/world\/src\/a\.ts is newer/);
    const fresh = freshness({ distMtimeMs: 1000, sources: [at(900), at(1000)], stamp: null });
    assert.equal(fresh.fresh, true, "a source as old as the dist is not newer");
    assert.match(fresh.reason, /2 source files/);
  });

  it("with the host's stamp, a deleted or added source and a changed newest mtime are seen", () => {
    const sources = [at(100), at(200), at(300)];
    const stamp = stampOf(sources);
    assert.deepEqual(stamp, { files: 3, newestMtimeMs: 300 });
    assert.equal(freshness({ distMtimeMs: 400, sources, stamp }).fresh, true);
    assert.match(freshness({ distMtimeMs: 400, sources: sources.slice(0, 2), stamp }).reason, /source set changed \(2 files, the build saw 3\)/);
    assert.match(freshness({ distMtimeMs: 400, sources: [...sources, at(50)], stamp }).reason, /source set changed/);
    // Three files as before, but the newest is another mtime (one file replaced by an older copy): a change.
    assert.equal(freshness({ distMtimeMs: 400, sources: [at(100), at(200), at(250)], stamp }).fresh, false);
  });

  it("the build runs vite's bin straight, in apps/world; npm run build only when the bin is not there", () => {
    const direct = buildCommand("/repo", (file) => file === path.join("/repo", "node_modules", "vite", "bin", "vite.js"), "/usr/bin/node");
    assert.deepEqual(direct, { file: "/usr/bin/node", args: [path.join("/repo", "node_modules", "vite", "bin", "vite.js"), "build"], cwd: path.join("/repo", "apps", "world") });
    assert.deepEqual(buildCommand("/repo", () => false, "/usr/bin/node"), { file: "npm", args: ["run", "build"], cwd: "/repo" });
  });

  it("the walk takes the world's sources and config, every package, the lockfile; never node_modules, dist, tests or dotfiles", () => {
    const root = mkdtempSync(path.join(tmpdir(), "crewhub-build-"));
    const put = (file: string) => {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), "x");
    };
    for (const f of ["apps/world/src/App.tsx", "apps/world/src/world/a.ts", "apps/world/index.html", "apps/world/vite.config.ts", "apps/world/package.json", "package-lock.json", "packages/demo/src/a.ts", "packages/demo/package.json"]) put(f);
    for (const f of ["apps/world/src/.hidden", "apps/world/dist/index.html", "packages/demo/node_modules/x/i.js", "packages/demo/test/a.test.ts", "packages/demo/dist/x.js", "apps/host/src/main.ts"]) put(f);
    const files = worldSources(root).map((f) => f.path).sort();
    assert.deepEqual(files, ["apps/world/index.html", "apps/world/package.json", "apps/world/src/App.tsx", "apps/world/src/world/a.ts", "apps/world/vite.config.ts", "package-lock.json", "packages/demo/package.json", "packages/demo/src/a.ts"]);
    const dist = path.join(root, "apps", "world", "dist");
    utimesSync(path.join(dist, "index.html"), new Date(5000), new Date(5000));
    assert.deepEqual(distState(dist), { distMtimeMs: 5000, stamp: null });
    writeFileSync(path.join(dist, ".crewhub-world-build.json"), JSON.stringify({ files: 8, newestMtimeMs: 4000 }));
    assert.deepEqual(distState(dist).stamp, { files: 8, newestMtimeMs: 4000 });
    writeFileSync(path.join(dist, ".crewhub-world-build.json"), "not json");
    assert.equal(distState(dist).stamp, null, "a broken stamp is no stamp");
  });
});

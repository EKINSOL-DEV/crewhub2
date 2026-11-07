/* Round 71, seam 2 (its base half): state/build.ts loads in Node. Its relative imports say `.ts`, as every node-tested
   module's do, and `useBuildMode` takes its editor (the town runtime's `edit` and `editAll`) as an argument instead of
   importing `./runtimes`, the one import whose chain reached the style package and Vite. The hook itself still runs
   only in a render (React's dispatcher), so this test holds the module's shape: it loads, it exports the hook, and the
   hook asks for the editor as its fifth argument. */
import assert from "node:assert/strict";
import test from "node:test";

test("state/build.ts loads in Node and exports useBuildMode, which takes the editor as its fifth argument", async () => {
  const build = await import("../src/state/build.ts");
  assert.equal(typeof build.useBuildMode, "function");
  assert.equal(build.useBuildMode.length, 5, "town, inside, focusedRoom, announce, editor");
});

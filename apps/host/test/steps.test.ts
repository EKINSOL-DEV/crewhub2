import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createStepPrinter, instructionLine, stepLine } from "../src/steps.ts";

describe("the step list of npm run world", () => {
  it("counts 'the world is up' from the key's acceptance, prints the snapshot once and later ones quietly", () => {
    let t = 0;
    const printer = createStepPrinter(() => t);
    t = 300;
    assert.deepEqual(printer.lines({ step: "discovery", ok: true, text: "loops found via app-socket", ms: 22 }), ["  ✓ loops found via app-socket (22 ms)"]);
    t = 65_000; // the person pasted the key a minute later
    assert.deepEqual(printer.lines({ step: "key", ok: true, text: "key crewhub-world (stored) accepted", ms: 4 }), ["  ✓ key crewhub-world (stored) accepted (4 ms)"]);
    t = 65_250;
    assert.deepEqual(printer.lines({ step: "snapshot", ok: true, text: "snapshot: 5 projects, 18 reads in 26 ms", ms: 26 }), [
      "  ✓ snapshot: 5 projects, 18 reads in 26 ms (26 ms)",
      "  ✓ the world is up, 250 ms after the key",
    ]);
    t = 70_000;
    assert.deepEqual(printer.lines({ step: "snapshot", ok: true, text: "snapshot: 5 projects, 18 reads in 28 ms", ms: 28 }), ["  · snapshot again (2): 5 projects, 18 reads in 28 ms"]);
    assert.deepEqual(printer.lines({ step: "snapshot", ok: true, text: "snapshot: 5 projects, 18 reads in 27 ms", ms: 27 }), ["  · snapshot again (3): 5 projects, 18 reads in 27 ms"]);
    assert.deepEqual(printer.lines({ step: "snapshot", ok: false, text: "snapshot failed: loops_down" }), ["  ✗ snapshot failed: loops_down"]);
  });

  it("without a key step the world-up line counts from the host's start; seconds above one second", () => {
    let t = 1_340;
    const printer = createStepPrinter(() => t);
    assert.deepEqual(printer.lines({ step: "snapshot", ok: true, text: "snapshot: 1 project, 7 reads in 9 ms", ms: 9 }), [
      "  ✓ snapshot: 1 project, 7 reads in 9 ms (9 ms)",
      "  ✓ the world is up, 1.3 s after the host started",
    ]);
  });

  it("a rejected key is a crossed step; an instruction has no mark", () => {
    const printer = createStepPrinter(() => 0);
    assert.deepEqual(printer.lines({ step: "key", ok: false, text: "key x rejected", ms: 5 }), ["  ✗ key x rejected (5 ms)"]);
    assert.equal(instructionLine("open this link in the browser to pair it (10 minutes, once):"), "    open this link in the browser to pair it (10 minutes, once):");
    assert.equal(stepLine(true, "world built", 1500), "  ✓ world built (1.5 s)");
  });
});

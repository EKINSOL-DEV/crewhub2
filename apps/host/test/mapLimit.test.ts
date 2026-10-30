import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapLimit } from "../src/snapshot.ts";

describe("mapLimit: the snapshot's capped parallel reads", () => {
  it("never has more than the cap in flight, starts in order and answers in order", async () => {
    let inFlight = 0;
    let peak = 0;
    const started: number[] = [];
    const out = await mapLimit([5, 1, 4, 2, 3, 6, 0], 3, async (n, index) => {
      started.push(index);
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      // The slow ones finish last; the order of the results must still be the items'.
      await new Promise((r) => setTimeout(r, n * 3));
      inFlight -= 1;
      return n * 10;
    });
    assert.deepEqual(out, [50, 10, 40, 20, 30, 60, 0], "results in the items' order whatever finished first");
    assert.deepEqual(started, [0, 1, 2, 3, 4, 5, 6], "started in the items' order");
    assert.equal(peak, 3, "the cap");
  });

  it("a cap below one counts as one (serial), an empty list answers at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapLimit([1, 2, 3], 0, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight -= 1;
      return n;
    });
    assert.deepEqual(out, [1, 2, 3]);
    assert.equal(peak, 1);
    assert.deepEqual(await mapLimit([], 4, async () => 1), []);
  });

  it("the first rejection rejects the whole", async () => {
    await assert.rejects(
      mapLimit([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      }),
      /boom/,
    );
  });

  it("starts nothing new after the first rejection (review F13): a refused key costs the reads in flight, not the whole queue", async () => {
    const started: number[] = [];
    await assert.rejects(
      mapLimit(Array.from({ length: 40 }, (_, i) => i), 6, async (i) => {
        started.push(i);
        await new Promise((r) => setTimeout(r, i === 0 ? 5 : 20));
        if (i === 0) throw new Error("401");
        return i;
      }),
      /401/,
    );
    // The five reads in flight beside the refused one finish on their own; give them time to take more if they would.
    await new Promise((r) => setTimeout(r, 80));
    assert.deepEqual(started, [0, 1, 2, 3, 4, 5]);
  });
});

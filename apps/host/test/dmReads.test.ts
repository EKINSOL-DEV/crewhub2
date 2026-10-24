/** The gate on the chat's message reads (question 14): the cap, the order, nothing dropped, and what is worth a retry. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DM_READ_LIMIT, createGate, retryableRead } from "../src/dmReads.ts";

/** A task the test finishes by hand. */
function held<T>(): { task: () => Promise<T>; finish: (value: T) => void; fail: (error: Error) => void; started: () => boolean } {
  let started = false;
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { task: () => ((started = true), promise), finish: resolve, fail: reject, started: () => started };
}

describe("the gate on the chat's message reads", () => {
  it("never has more than the limit in flight, starts the rest in arrival order as slots free up, and drops none", async () => {
    const gate = createGate(3);
    const tasks = Array.from({ length: 10 }, () => held<number>());
    const results = tasks.map((t, i) => gate.run(() => t.task().then(() => i)));
    assert.deepEqual(tasks.map((t) => t.started()), [true, true, true, false, false, false, false, false, false, false]);
    assert.equal(gate.inFlight(), 3);
    assert.equal(gate.waiting(), 7);
    // The second one finishes first: the fourth starts, not the fifth.
    tasks[1]!.finish(0);
    await results[1];
    assert.equal(tasks[3]!.started(), true);
    assert.equal(tasks[4]!.started(), false);
    assert.equal(gate.inFlight(), 3);
    assert.equal(gate.waiting(), 6);
    for (const [i, t] of tasks.entries()) if (i !== 1) t.finish(0);
    assert.deepEqual(await Promise.all(results), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], "every task answered");
    assert.equal(gate.inFlight(), 0);
    assert.equal(gate.waiting(), 0);
  });

  it("a task that rejects frees its slot and rejects its caller only", async () => {
    const gate = createGate(1);
    const first = held<string>();
    const second = held<string>();
    const a = gate.run(first.task);
    const b = gate.run(second.task);
    first.fail(new Error("boom"));
    await assert.rejects(a, /boom/);
    assert.equal(second.started(), true, "the next one started");
    second.finish("fine");
    assert.equal(await b, "fine");
  });

  it("a limit below one is one (serial), and the default is eight", async () => {
    const gate = createGate(0);
    const order: string[] = [];
    await Promise.all([
      gate.run(async () => {
        order.push("a-start");
        await new Promise((r) => setTimeout(r, 5));
        order.push("a-end");
      }),
      gate.run(async () => {
        order.push("b-start");
        order.push("b-end");
      }),
    ]);
    assert.deepEqual(order, ["a-start", "a-end", "b-start", "b-end"]);
    assert.equal(DM_READ_LIMIT, 8);
  });

  it("a read is tried once more when loops did not answer, is in trouble or asks for a pause; never when it said no", () => {
    for (const status of [null, 500, 502, 503, 504, 429]) assert.equal(retryableRead(status), true, `${status}`);
    for (const status of [200, 204, 400, 401, 403, 404, 409, 410]) assert.equal(retryableRead(status), false, `${status}`);
  });
});

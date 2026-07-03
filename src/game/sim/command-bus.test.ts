import { beforeEach, describe, expect, it } from "vitest";
import { drainCommands, postCommand } from "./command-bus";

describe("command-bus", () => {
  beforeEach(() => {
    drainCommands(); // flush any leftovers from a prior test
  });

  it("drains nothing when the queue is empty", () => {
    expect(drainCommands()).toEqual([]);
  });

  it("returns posted commands in FIFO order", () => {
    postCommand("a", { kind: "emote", emote: "dance" });
    postCommand("b", { kind: "goto", x: 1, z: 2 });
    expect(drainCommands()).toEqual([
      { key: "a", cmd: { kind: "emote", emote: "dance" } },
      { key: "b", cmd: { kind: "goto", x: 1, z: 2 } },
    ]);
  });

  it("clears the queue on drain — a second drain is empty", () => {
    postCommand("a", { kind: "emote", emote: "wave" });
    drainCommands();
    expect(drainCommands()).toEqual([]);
  });

  it("keeps queues from separate posts independent of drains in between", () => {
    postCommand("a", { kind: "goto", x: 0, z: 0 });
    expect(drainCommands()).toEqual([{ key: "a", cmd: { kind: "goto", x: 0, z: 0 } }]);
    postCommand("b", { kind: "goto", x: 5, z: 5 });
    expect(drainCommands()).toEqual([{ key: "b", cmd: { kind: "goto", x: 5, z: 5 } }]);
  });
});

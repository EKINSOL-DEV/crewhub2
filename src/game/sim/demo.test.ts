// M1 T8: demoCharacters covers every status the sim can render, with a
// resting-crew entry, so `?demo` is a reliable smoke test without live data.
import { describe, expect, it } from "vitest";
import { DEMO_GROUP, demoCharacters } from "./demo";

describe("demoCharacters", () => {
  it("returns exactly six characters", () => {
    expect(demoCharacters(0)).toHaveLength(6);
  });

  it("covers every status the brief calls for", () => {
    const statuses = demoCharacters(0).map((c) => c.status);
    expect(statuses.filter((s) => s === "Working")).toHaveLength(2);
    expect(statuses.filter((s) => s === "WaitingForPermission")).toHaveLength(1);
    expect(statuses.filter((s) => s === "WaitingForInput")).toHaveLength(1);
    expect(statuses.filter((s) => s === "Idle")).toHaveLength(2);
  });

  it("gives the resting crew entry an agentId and Idle status", () => {
    const crew = demoCharacters(0).find((c) => c.agentId !== null);
    expect(crew).toBeDefined();
    expect(crew!.agentId).toBe("demo-crew");
    expect(crew!.status).toBe("Idle");
  });

  it("has unique keys", () => {
    const keys = demoCharacters(0).map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("is deterministic", () => {
    expect(demoCharacters(123)).toEqual(demoCharacters(123));
  });

  // M5 T5: every demo character shares DEMO_GROUP so use-sim.ts's demo
  // override (which stamps DEMO_GROUP on every building, ignoring real
  // project links entirely) actually seats them — see use-sim.test.tsx's
  // "demo override" test for the sim-level proof.
  it("gives every character the shared DEMO_GROUP so the sim's project-room matching still seats them", () => {
    for (const c of demoCharacters(0)) {
      expect(c.groupKey).toBe(DEMO_GROUP);
    }
  });
});

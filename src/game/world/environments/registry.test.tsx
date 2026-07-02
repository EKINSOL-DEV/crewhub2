import { describe, expect, it } from "vitest";
import { ENVIRONMENTS, environmentById } from "./registry";

describe("environment registry", () => {
  it("ships campus as the first environment", () => {
    expect(ENVIRONMENTS.map((e) => e.id)).toContain("campus");
  });

  it("falls back to campus for unknown ids", () => {
    expect(environmentById("desert-from-the-old-world").id).toBe("campus");
    expect(environmentById("campus").id).toBe("campus");
  });
});

import { describe, expect, it } from "vitest";
import { MODEL_IDS, modelUrl } from "./manifest";

describe("asset manifest", () => {
  it("exposes every manifest entry as a typed id", () => {
    expect(MODEL_IDS.length).toBeGreaterThanOrEqual(19);
    expect(MODEL_IDS).toContain("fountain");
    expect(MODEL_IDS).toContain("tree-default");
  });

  it("builds public urls", () => {
    expect(modelUrl("fountain")).toBe("/assets/models/fountain.glb");
  });
});

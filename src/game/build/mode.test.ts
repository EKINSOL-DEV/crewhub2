import { beforeEach, describe, expect, it } from "vitest";
import { useBuildMode } from "./mode";

describe("useBuildMode", () => {
  beforeEach(() => {
    useBuildMode.setState({ active: false, tool: { kind: "select" } });
  });

  it("starts inactive on the select tool", () => {
    expect(useBuildMode.getState().active).toBe(false);
    expect(useBuildMode.getState().tool).toEqual({ kind: "select" });
  });

  it("activate turns build mode on, always defaulting to select", () => {
    useBuildMode.getState().setTool({ kind: "building" });
    useBuildMode.getState().activate();
    expect(useBuildMode.getState().active).toBe(true);
    expect(useBuildMode.getState().tool).toEqual({ kind: "select" });
  });

  it("setTool swaps the active tool without touching `active`", () => {
    useBuildMode.getState().activate();
    useBuildMode.getState().setTool({ kind: "item", item: "bush" });
    expect(useBuildMode.getState().tool).toEqual({ kind: "item", item: "bush" });
    expect(useBuildMode.getState().active).toBe(true);
  });

  it("deactivate turns build mode off and resets the tool", () => {
    useBuildMode.getState().activate();
    useBuildMode.getState().setTool({ kind: "building" });
    useBuildMode.getState().deactivate();
    expect(useBuildMode.getState().active).toBe(false);
    expect(useBuildMode.getState().tool).toEqual({ kind: "select" });
  });
});

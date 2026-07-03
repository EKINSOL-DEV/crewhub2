import { beforeEach, describe, expect, it } from "vitest";
import { useBuildMode } from "./mode";

describe("useBuildMode", () => {
  beforeEach(() => {
    useBuildMode.setState({ active: false, tool: { kind: "select" }, pendingRoomLink: null, roomCard: null });
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

  it("openRoomLink/closeRoomLink set and clear pendingRoomLink", () => {
    expect(useBuildMode.getState().pendingRoomLink).toBeNull();
    useBuildMode.getState().openRoomLink("b1");
    expect(useBuildMode.getState().pendingRoomLink).toBe("b1");
    useBuildMode.getState().closeRoomLink();
    expect(useBuildMode.getState().pendingRoomLink).toBeNull();
  });

  it("deactivate also dismisses a dangling room-link prompt", () => {
    useBuildMode.getState().activate();
    useBuildMode.getState().openRoomLink("b1");
    useBuildMode.getState().deactivate();
    expect(useBuildMode.getState().pendingRoomLink).toBeNull();
  });

  it("openRoomCard/closeRoomCard set and clear the roomCard target", () => {
    expect(useBuildMode.getState().roomCard).toBeNull();
    useBuildMode.getState().openRoomCard({ kind: "plot", plotIndex: 2 });
    expect(useBuildMode.getState().roomCard).toEqual({ kind: "plot", plotIndex: 2 });
    useBuildMode.getState().closeRoomCard();
    expect(useBuildMode.getState().roomCard).toBeNull();
  });

  it("openRoomCard also works for a placed building target", () => {
    useBuildMode.getState().openRoomCard({ kind: "placed", id: "b1" });
    expect(useBuildMode.getState().roomCard).toEqual({ kind: "placed", id: "b1" });
  });

  it("activate dismisses a dangling room card", () => {
    useBuildMode.getState().openRoomCard({ kind: "placed", id: "b1" });
    useBuildMode.getState().activate();
    expect(useBuildMode.getState().roomCard).toBeNull();
  });

  it("openRoomCard also accepts the M6 T4 hq/projects/hire arms", () => {
    useBuildMode.getState().openRoomCard({ kind: "hq" });
    expect(useBuildMode.getState().roomCard).toEqual({ kind: "hq" });
    useBuildMode.getState().openRoomCard({ kind: "projects" });
    expect(useBuildMode.getState().roomCard).toEqual({ kind: "projects" });
    useBuildMode.getState().openRoomCard({ kind: "hire" });
    expect(useBuildMode.getState().roomCard).toEqual({ kind: "hire" });
  });

  it("single-open: opening any card replaces whatever card was already open", () => {
    useBuildMode.getState().openRoomCard({ kind: "plot", plotIndex: 0 });
    useBuildMode.getState().openRoomCard({ kind: "hq" });
    expect(useBuildMode.getState().roomCard).toEqual({ kind: "hq" });
    useBuildMode.getState().openRoomCard({ kind: "projects" });
    expect(useBuildMode.getState().roomCard).toEqual({ kind: "projects" });
  });

  it("activate dismisses a dangling hq/projects/hire card too", () => {
    useBuildMode.getState().openRoomCard({ kind: "hq" });
    useBuildMode.getState().activate();
    expect(useBuildMode.getState().roomCard).toBeNull();
  });
});

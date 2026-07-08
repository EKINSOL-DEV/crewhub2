import { beforeEach, describe, expect, it } from "vitest";
import { useBuildMode, type CardTarget } from "./mode";

describe("useBuildMode", () => {
  beforeEach(() => {
    useBuildMode.setState({
      active: false,
      tool: { kind: "select" },
      pendingRoomLink: null,
      roomCard: null,
      cameraCoupledCard: null,
    });
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

  it("openRoomCard also accepts the M9 T2 dossier arm, keyed by bot", () => {
    useBuildMode.getState().openRoomCard({ kind: "dossier", key: "claude:s1" });
    expect(useBuildMode.getState().roomCard).toEqual({ kind: "dossier", key: "claude:s1" });
  });

  it("single-open: opening the dossier replaces whatever card was open, and vice versa", () => {
    useBuildMode.getState().openRoomCard({ kind: "hq" });
    useBuildMode.getState().openRoomCard({ kind: "dossier", key: "claude:s1" });
    expect(useBuildMode.getState().roomCard).toEqual({ kind: "dossier", key: "claude:s1" });
    useBuildMode.getState().openRoomCard({ kind: "projects" });
    expect(useBuildMode.getState().roomCard).toEqual({ kind: "projects" });
  });

  it("re-targeting the dossier to a different key (e.g. a 'Forked from' click) still replaces the field", () => {
    useBuildMode.getState().openRoomCard({ kind: "dossier", key: "claude:child" });
    useBuildMode.getState().openRoomCard({ kind: "dossier", key: "claude:parent" });
    expect(useBuildMode.getState().roomCard).toEqual({ kind: "dossier", key: "claude:parent" });
  });

  it("activate dismisses a dangling dossier card too", () => {
    useBuildMode.getState().openRoomCard({ kind: "dossier", key: "claude:s1" });
    useBuildMode.getState().activate();
    expect(useBuildMode.getState().roomCard).toBeNull();
  });

  it("openRoomCard also accepts the M9 fix-round-1 hire arm's optional agentId", () => {
    useBuildMode.getState().openRoomCard({ kind: "hire", agentId: "ag1" });
    expect(useBuildMode.getState().roomCard).toEqual({ kind: "hire", agentId: "ag1" });
  });

  // Round 3 fix: `cameraCoupledCard` tracks WHICH open action also engaged
  // the camera, so GameShell's mode->free effect can close only that
  // specific card instead of any card that merely shares a kind with it.
  it("plain openRoomCard never sets cameraCoupledCard", () => {
    useBuildMode.getState().openRoomCard({ kind: "dossier", key: "claude:s1" });
    expect(useBuildMode.getState().cameraCoupledCard).toBeNull();
  });

  it("openCameraCoupledCard sets both roomCard and cameraCoupledCard to the same target", () => {
    const target: CardTarget = { kind: "dossier", key: "claude:s1" };
    useBuildMode.getState().openCameraCoupledCard(target);
    expect(useBuildMode.getState().roomCard).toEqual(target);
    expect(useBuildMode.getState().cameraCoupledCard).toBe(useBuildMode.getState().roomCard);
  });

  it("closeRoomCard clears cameraCoupledCard along with roomCard", () => {
    useBuildMode.getState().openCameraCoupledCard({ kind: "hq" });
    useBuildMode.getState().closeRoomCard();
    expect(useBuildMode.getState().roomCard).toBeNull();
    expect(useBuildMode.getState().cameraCoupledCard).toBeNull();
  });

  it("activate clears cameraCoupledCard along with roomCard", () => {
    useBuildMode.getState().openCameraCoupledCard({ kind: "placed", id: "b1" });
    useBuildMode.getState().activate();
    expect(useBuildMode.getState().cameraCoupledCard).toBeNull();
  });

  it("opening an uncoupled card over a camera-coupled one leaves a stale (non-matching) cameraCoupledCard, not the new one", () => {
    useBuildMode.getState().openCameraCoupledCard({ kind: "dossier", key: "bot:a" });
    useBuildMode.getState().openRoomCard({ kind: "dossier", key: "bot:b" });
    expect(useBuildMode.getState().roomCard).toEqual({ kind: "dossier", key: "bot:b" });
    // Reference-inequality is exactly the point: bot:b's own open was never
    // camera-coupled, so it must never accidentally match.
    expect(useBuildMode.getState().cameraCoupledCard).not.toBe(useBuildMode.getState().roomCard);
  });
});

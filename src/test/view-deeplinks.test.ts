// Game-HUD shell (EKI-121): deep links out of the world (bot-click chat,
// wall-click board, git-strip diff, palette "open panel") open a drawer OVER
// the world — never a view switch. The classic workspace-tree adoption only
// applies in `?window=` routes (covered by the open-chat suite).
import { openChatPanel } from "@/app/open-chat";
import { useOverlays } from "@/app/overlays";
import { openPanel } from "@/app/palette-actions";
import { openAutomationPanel } from "@/panels/automation/open-automation";
import { openBoardPanel } from "@/panels/board/open-board";
import { openDiffPanel } from "@/panels/diff/open-diff";
import { resetWorkspaceForTests } from "@/stores/workspace";
import { seedWorkspace } from "./fixtures";

beforeEach(() => useOverlays.setState({ overlay: null }));
afterEach(() => useOverlays.setState({ overlay: null }));

test("bot-click chat: openChatPanel opens the chat drawer on the session", () => {
  openChatPanel({ provider: "claude-code", id: "s-1", seq: 7 });
  expect(useOverlays.getState().overlay).toMatchObject({
    kind: "chat",
    params: { sessionId: "claude-code:s-1", seq: "7" },
  });
});

test("wall-click board: openBoardPanel opens the board drawer with its scope", () => {
  openBoardPanel({ room: "room-1", hq: "" });
  expect(useOverlays.getState().overlay).toMatchObject({ kind: "board", params: { room: "room-1" } });
});

test("openDiffPanel opens the diff drawer on the project", () => {
  openDiffPanel("/work/proj", "main");
  expect(useOverlays.getState().overlay).toMatchObject({
    kind: "diff",
    params: { projectPath: "/work/proj", base: "main" },
  });
});

test("openAutomationPanel opens the automation drawer", () => {
  openAutomationPanel({ create: "1" });
  expect(useOverlays.getState().overlay).toMatchObject({ kind: "automation", params: { create: "1" } });
});

test("palette openPanel opens any panel as a drawer", () => {
  openPanel("sessions");
  expect(useOverlays.getState().overlay).toMatchObject({ kind: "sessions" });
});

test("toggle closes an already-open panel (the dock buttons)", () => {
  useOverlays.getState().toggle("crew");
  expect(useOverlays.getState().overlay?.kind).toBe("crew");
  useOverlays.getState().toggle("crew");
  expect(useOverlays.getState().overlay).toBeNull();
});

test("`?window=` routes keep the classic workspace adoption instead", () => {
  window.history.replaceState(null, "", "/?window=workspace");
  try {
    seedWorkspace();
    openChatPanel({ provider: "claude-code", id: "s-1" });
    expect(useOverlays.getState().overlay).toBeNull(); // no drawer in the grid window
  } finally {
    window.history.replaceState(null, "", "/");
    resetWorkspaceForTests();
  }
});

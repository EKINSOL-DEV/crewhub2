// World-primary shell: deep links out of the world (bot-click chat, wall-click
// board, room-card / git-strip diff, palette "open panel") must land the user
// in the workspace view — adoption itself is covered by the open-* suites.
import { openChatPanel } from "@/app/open-chat";
import { openPanel } from "@/app/palette-actions";
import { openAutomationPanel } from "@/panels/automation/open-automation";
import { openBoardPanel } from "@/panels/board/open-board";
import { openDiffPanel } from "@/panels/diff/open-diff";
import { resetAppViewForTests, useAppView } from "@/stores/appView";
import { resetWorkspaceForTests } from "@/stores/workspace";
import { seedWorkspace } from "./fixtures";

beforeEach(() => {
  seedWorkspace();
  resetAppViewForTests(); // boot state: the world
});

afterEach(() => {
  resetWorkspaceForTests();
  resetAppViewForTests();
});

test("bot-click chat: openChatPanel switches the view to workspace", () => {
  openChatPanel({ provider: "claude-code", id: "s-1" });
  expect(useAppView.getState().view).toBe("workspace");
});

test("wall-click board: openBoardPanel switches the view to workspace", () => {
  openBoardPanel({ room: "room-1", hq: "" });
  expect(useAppView.getState().view).toBe("workspace");
});

test("openDiffPanel switches the view to workspace", () => {
  openDiffPanel("/work/proj");
  expect(useAppView.getState().view).toBe("workspace");
});

test("openAutomationPanel switches the view to workspace", () => {
  openAutomationPanel({ create: "1" });
  expect(useAppView.getState().view).toBe("workspace");
});

test("palette openPanel switches the view to workspace", () => {
  openPanel("sessions");
  expect(useAppView.getState().view).toBe("workspace");
});

test("no workspace loaded → deep link stays a silent no-op and the world keeps the stage", () => {
  resetWorkspaceForTests(); // tabs gone
  expect(() => openChatPanel({ provider: "claude-code", id: "s-1" })).not.toThrow();
  expect(useAppView.getState().view).toBe("world");
});

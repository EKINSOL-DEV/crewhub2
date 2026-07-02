// openChatPanel (merge of Lane C's open-chat gesture into Lane A's workspace
// store): focus existing > adopt unbound chat/welcome > split.
import { leaves, makeLeaf } from "@/app/layout-tree";
import { openChatPanel } from "@/app/open-chat";
import { resetWorkspaceForTests, useWorkspace } from "@/stores/workspace";
import { chatLeaves, seedWorkspace } from "./fixtures";

// EKI-121: the workspace tree only exists in `?window=` routes — the main
// window opens chats as world overlays (covered by view-deeplinks).
beforeEach(() => window.history.replaceState(null, "", "/?window=workspace"));

afterEach(() => {
  window.history.replaceState(null, "", "/");
  resetWorkspaceForTests();
});

test("no workspace yet → a silent no-op", () => {
  resetWorkspaceForTests();
  expect(() => openChatPanel({ provider: "claude-code", id: "s-1" })).not.toThrow();
});

test("adopts a welcome leaf with sessionId/mode/seq/note params and focuses it", () => {
  seedWorkspace();
  openChatPanel({ provider: "claude-code", id: "s-1", mode: "history", seq: 7, note: "fork of x" });
  const chats = chatLeaves();
  expect(chats).toHaveLength(1);
  expect(chats[0]?.params).toEqual({
    sessionId: "claude-code:s-1",
    mode: "history",
    seq: "7",
    note: "fork of x",
  });
  expect(useWorkspace.getState().focusedLeafId).toBe(chats[0]?.id);
});

test("focuses an existing chat on the same session instead of opening another", () => {
  seedWorkspace();
  openChatPanel({ provider: "claude-code", id: "s-1" });
  const first = chatLeaves()[0]!;
  // a second request for the same session reuses the panel (params refreshed)
  openChatPanel({ provider: "claude-code", id: "s-1", seq: 3 });
  expect(chatLeaves()).toHaveLength(1);
  expect(chatLeaves()[0]?.id).toBe(first.id);
  expect(chatLeaves()[0]?.params).toMatchObject({ sessionId: "claude-code:s-1", seq: "3" });
});

test("adopts an unbound chat panel before splitting", () => {
  seedWorkspace();
  const tab = useWorkspace.getState().tabs[0]!;
  useWorkspace.setState({ tabs: [{ ...tab, root: makeLeaf("chat") }] });
  openChatPanel({ provider: "claude-code", id: "s-2" });
  expect(chatLeaves()).toHaveLength(1);
  expect(chatLeaves()[0]?.params).toMatchObject({ sessionId: "claude-code:s-2" });
});

test("splits when every leaf is occupied — a second session gets its own panel", () => {
  seedWorkspace();
  openChatPanel({ provider: "claude-code", id: "s-1" });
  openChatPanel({ provider: "claude-code", id: "s-2" });
  const chats = chatLeaves();
  expect(chats).toHaveLength(2);
  expect(chats.map((l) => l.params?.sessionId).sort()).toEqual(["claude-code:s-1", "claude-code:s-2"]);
});

test("ignores leaves in other (inactive) tabs", () => {
  seedWorkspace();
  const other = { id: "tab-2", name: "Other", root: makeLeaf("welcome"), projectFilter: null };
  useWorkspace.setState((s) => ({ tabs: [...s.tabs, other] }));
  openChatPanel({ provider: "claude-code", id: "s-9" });
  expect(chatLeaves()[0]?.params).toMatchObject({ sessionId: "claude-code:s-9" });
  expect(leaves(other.root).some((l) => l.kind === "chat")).toBe(false);
});

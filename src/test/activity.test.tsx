import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { ActivityPanel } from "@/panels/activity/ActivityPanel";
import {
  foldActivity,
  groupActivity,
  pushBounded,
  useActivityStore,
  type ActivityEntry,
} from "@/stores/activity";
import { useAgentsStore } from "@/stores/agents";
import { useBindingsStore } from "@/stores/bindings";
import { useSessionsStore } from "@/stores/sessions";
import { resetWorkspaceForTests } from "@/stores/workspace";
import { binding, chatLeaves, meta, seedWorkspace, sid } from "./fixtures";

beforeEach(seedWorkspace);
afterEach(() => {
  cleanup();
  clearMocks();
  useActivityStore.getState().reset();
  useAgentsStore.getState().reset();
  useSessionsStore.getState().reset();
  useBindingsStore.getState().reset();
  resetWorkspaceForTests();
});

const NOW = Date.now();

describe("foldActivity", () => {
  test("messages and tool-uses become entries; tool results/thinking/usage collapse", () => {
    const id = sid("s-1");
    const user = foldActivity(
      { type: "Item", data: { id, seq: 1, item: { kind: "UserText", data: { text: "hi  there", ts: 0 } } } },
      NOW,
    );
    expect(user).toMatchObject({ kind: "message", emoji: "💬", text: "hi there", seq: 1 });

    const tool = foldActivity(
      {
        type: "Item",
        data: {
          id,
          seq: 2,
          item: {
            kind: "ToolUse",
            data: { tool: "Edit", input_json: '{"file_path":"/work/src/foo.rs"}', tool_use_id: "t1", ts: 0 },
          },
        },
      },
      NOW,
    );
    expect(tool).toMatchObject({ kind: "tool", emoji: "✏️", text: "Edit /work/src/foo.rs" });

    for (const item of [
      { kind: "ToolResult", data: { tool_use_id: "t1", output_preview: "ok", is_error: false, ts: 0 } },
      { kind: "Thinking", data: { text: "hmm", redacted: false, ts: 0 } },
      { kind: "Usage", data: { input_tokens: 1, output_tokens: 1, cache_read: 0, ts: 0 } },
    ] as const) {
      expect(foldActivity({ type: "Item", data: { id, seq: 3, item } }, NOW)).toBeNull();
    }
  });

  test("conflicts are loud; lifecycle + permission events map", () => {
    const conflict = foldActivity(
      { type: "Conflict", data: { path: "/work/src/foo.rs", sessions: [sid("a"), sid("b")] } },
      NOW,
    );
    expect(conflict).toMatchObject({
      kind: "conflict",
      loud: true,
      text: "2 sessions editing /work/src/foo.rs",
    });

    expect(foldActivity({ type: "Discovered", data: { meta: meta({ id: sid("s-1") }) } }, NOW)).toMatchObject(
      { kind: "lifecycle", emoji: "✨" },
    );
    expect(foldActivity({ type: "Removed", data: { id: sid("s-1") } }, NOW)).toMatchObject({
      kind: "lifecycle",
      emoji: "🪦",
    });
    expect(
      foldActivity(
        {
          type: "PermissionRequest",
          data: {
            id: sid("s-1"),
            request: { request_id: "r", tool: "Bash", input_json: "{}", suggestions: [] },
          },
        },
        NOW,
      ),
    ).toMatchObject({ kind: "permission", emoji: "🙋", text: "asked permission for Bash" });
  });
});

test("ring buffer stays bounded at 1k", () => {
  let entries: ActivityEntry[] = [];
  for (let i = 0; i < 1005; i++) {
    entries = pushBounded(entries, {
      id: `e-${i}`,
      ts: NOW,
      kind: "message",
      sessionId: null,
      sessionKey: null,
      emoji: "💬",
      text: String(i),
    });
  }
  expect(entries).toHaveLength(1000);
  expect(entries[0]?.text).toBe("1004"); // newest first
});

test("groupActivity splits Today / Earlier", () => {
  const today: ActivityEntry = {
    id: "a",
    ts: NOW,
    kind: "message",
    sessionId: null,
    sessionKey: null,
    emoji: "💬",
    text: "now",
  };
  const earlier: ActivityEntry = { ...today, id: "b", ts: NOW - 2 * 86_400_000, text: "old" };
  const groups = groupActivity([today, earlier], NOW);
  expect(groups.map((g) => g.label)).toEqual(["Today", "Earlier"]);
  expect(groups[0]?.entries[0]?.text).toBe("now");
});

test("REGRESSION: loading resolves to the empty state when no events arrive (v1 stuck spinner)", async () => {
  mockIPC((cmd) => {
    if (cmd === "list_all_sessions") return [];
    if (cmd === "list_agents" || cmd === "list_session_bindings" || cmd === "list_rooms") return [];
    return null;
  });
  render(<ActivityPanel />);
  await screen.findByText("All calm");
  expect(screen.queryByTestId("activity-loading")).toBeNull();
});

test("entries stream in live, filter by session chip, click-through opens chat at seq", async () => {
  mockIPC((cmd) => {
    if (cmd === "list_all_sessions") return [meta({ id: sid("s-1") }), meta({ id: sid("s-2") })];
    if (cmd === "list_session_bindings") return [binding({ session_id: "s-1", display_name: "Refactor" })];
    if (cmd === "list_agents" || cmd === "list_rooms") return [];
    return null;
  });
  render(<ActivityPanel />);
  await screen.findByText("All calm");

  act(() => {
    useActivityStore.getState().apply({
      type: "Item",
      data: { id: sid("s-1"), seq: 7, item: { kind: "UserText", data: { text: "from one", ts: 0 } } },
    });
    useActivityStore.getState().apply({
      type: "Item",
      data: { id: sid("s-2"), seq: 9, item: { kind: "AssistantText", data: { text: "from two", ts: 0 } } },
    });
  });
  expect(screen.getByText("from one")).toBeInTheDocument();
  expect(screen.getByText("from two")).toBeInTheDocument();

  // filter to session one via its display-name chip
  fireEvent.click(await screen.findByRole("button", { name: "Refactor" }));
  expect(screen.getByText("from one")).toBeInTheDocument();
  expect(screen.queryByText("from two")).toBeNull();

  fireEvent.click(screen.getByText("from one"));
  expect(chatLeaves()[0]?.params).toMatchObject({ sessionId: "claude-code:s-1", seq: "7" });
});

test("conflicts render loud", async () => {
  mockIPC((cmd) => {
    if (cmd === "list_all_sessions") return [];
    if (cmd === "list_agents" || cmd === "list_session_bindings" || cmd === "list_rooms") return [];
    return null;
  });
  render(<ActivityPanel />);
  await screen.findByText("All calm");
  act(() => {
    useActivityStore.getState().apply({
      type: "Conflict",
      data: { path: "/work/src/foo.rs", sessions: [sid("a"), sid("b")] },
    });
  });
  const loud = screen.getByText("2 sessions editing /work/src/foo.rs");
  expect(loud.closest("div")?.className).toContain("border-red-500");
});

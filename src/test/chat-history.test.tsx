// T16 (EKI-60): history mode — read-only any session, take-over & fork.
import { mockReducedMotion, TEST_SID, user, assistant } from "./chat-helpers";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SessionMeta } from "@/ipc/bindings";
import { sessionKey, useTranscripts } from "@/stores/transcripts";
import { ChatPanel } from "@/panels/chat";
import { canTakeOver, HistoryFooter } from "@/panels/chat/HistoryFooter";
import { ingestMeta, useMetaStore } from "@/panels/chat/useSessionMeta";

const KEY = sessionKey(TEST_SID);

function meta(over: Partial<SessionMeta>): SessionMeta {
  return {
    id: TEST_SID,
    origin: "External",
    project_path: "/work/proj",
    model: "sonnet",
    status: "Idle",
    activity_detail: null,
    parent: null,
    usage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0 },
    git_branch: null,
    last_activity_ms: 0,
    ...over,
  };
}

beforeEach(() => {
  mockReducedMotion(false);
  useTranscripts.setState({ sessions: {} });
  useMetaStore.setState({ metas: {} });
});
afterEach(clearMocks);

test("canTakeOver gating (EKI-60)", () => {
  expect(canTakeOver(undefined)).toBe(true); // archived
  expect(canTakeOver(meta({ origin: "External", status: "Idle" }))).toBe(true);
  expect(canTakeOver(meta({ origin: "External", status: "Ended" }))).toBe(true);
  expect(canTakeOver(meta({ origin: "Managed", status: "Ended" }))).toBe(true);
  expect(canTakeOver(meta({ origin: "External", status: "Working" }))).toBe(false);
  expect(canTakeOver(meta({ origin: "Managed", status: "Idle" }))).toBe(false);
});

test("history mode renders read-only: pages from disk, no composer, footer bar", async () => {
  mockIPC((cmd, args) => {
    if (cmd === "list_all_sessions") return [];
    if (cmd === "get_session_transcript") {
      const { limit } = args as { limit: number };
      if (limit === 0) return { items: [], total: 2 };
      return {
        items: [
          { seq: 0, item: user("archived question") },
          { seq: 1, item: assistant("archived answer") },
        ],
        total: 2,
      };
    }
    return null;
  });
  render(
    <ChatPanel
      leafId="leaf1"
      params={{ sessionId: KEY, mode: "history", projectPath: "/work/proj" }}
      setParams={vi.fn()}
    />,
  );
  await screen.findByText("archived question");
  expect(screen.getByText("archived answer")).toBeInTheDocument();
  expect(screen.getByTestId("meta-strip")).toHaveTextContent("👀 history");
  expect(screen.queryByTestId("composer")).not.toBeInTheDocument();
  expect(screen.getByTestId("history-footer")).toBeInTheDocument();
});

test("take-over resumes (fork: false) and swaps the panel live", async () => {
  const specs: Array<Record<string, unknown>> = [];
  mockIPC((cmd, args) => {
    if (cmd === "spawn_session") {
      specs.push((args as { spec: Record<string, unknown> }).spec);
      return { provider: "claude-code", id: "resumed-1" };
    }
    return null;
  });
  const onLive = vi.fn();
  render(<HistoryFooter sid={TEST_SID} projectPath="/work/proj" onLive={onLive} />);
  await userEvent.click(screen.getByTestId("history-take-over"));
  await userEvent.click(screen.getByTestId("history-confirm-go"));
  await waitFor(() =>
    expect(onLive).toHaveBeenCalledWith({ provider: "claude-code", id: "resumed-1" }, "takeover"),
  );
  expect(specs[0]?.resume_session).toBe(TEST_SID.id);
  expect(specs[0]?.fork).toBe(false);
  expect(specs[0]?.project_path).toBe("/work/proj");
});

test("fork from here spawns with fork: true", async () => {
  const specs: Array<Record<string, unknown>> = [];
  mockIPC((cmd, args) => {
    if (cmd === "spawn_session") {
      specs.push((args as { spec: Record<string, unknown> }).spec);
      return { provider: "claude-code", id: "fork-1" };
    }
    return null;
  });
  const onLive = vi.fn();
  render(<HistoryFooter sid={TEST_SID} projectPath="/work/proj" onLive={onLive} />);
  await userEvent.click(screen.getByTestId("history-fork"));
  await userEvent.click(screen.getByTestId("history-confirm-go"));
  await waitFor(() => expect(onLive).toHaveBeenCalledWith({ provider: "claude-code", id: "fork-1" }, "fork"));
  expect(specs[0]?.fork).toBe(true);
});

test("take-over is disabled while an External session is mid-run", () => {
  mockIPC(() => null);
  ingestMeta(meta({ status: "Working" }));
  render(<HistoryFooter sid={TEST_SID} projectPath="/work/proj" onLive={vi.fn()} />);
  expect(screen.getByTestId("history-take-over")).toBeDisabled();
});

test("ChatPanel swaps params to the resumed session (mode cleared)", async () => {
  mockIPC((cmd, args) => {
    if (cmd === "list_all_sessions") return [];
    if (cmd === "get_session_transcript") return { items: [], total: 0 };
    if (cmd === "spawn_session") {
      void args;
      return { provider: "claude-code", id: "resumed-2" };
    }
    return null;
  });
  const setParams = vi.fn();
  render(
    <ChatPanel
      leafId="leaf1"
      params={{ sessionId: KEY, mode: "history", projectPath: "/work/proj" }}
      setParams={setParams}
    />,
  );
  await userEvent.click(await screen.findByTestId("history-take-over"));
  await userEvent.click(screen.getByTestId("history-confirm-go"));
  await waitFor(() => expect(setParams).toHaveBeenCalledWith({ sessionId: "claude-code:resumed-2" }));
});

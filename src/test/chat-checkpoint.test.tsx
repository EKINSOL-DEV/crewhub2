// T17 (EKI-64): checkpoint markers + rewind = fork-from-checkpoint.
import { mockReducedMotion, TEST_SID, user, checkpoint } from "./chat-helpers";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSessionsStore } from "@/stores/sessions";
import { resetWorkspaceForTests } from "@/stores/workspace";
import { sessionKey, useTranscripts } from "@/stores/transcripts";
import { ChatPanel } from "@/panels/chat";
import { CheckpointMarker } from "@/panels/chat/items/Rows";
import { chatLeaves, seedWorkspace } from "./fixtures";

// EKI-121: deep links adopt workspace leaves only in `?window=` routes — this
// suite exercises that classic path (the main window opens overlays instead).
beforeEach(() => window.history.replaceState(null, "", "/?window=workspace"));
afterEach(() => window.history.replaceState(null, "", "/"));

const KEY = sessionKey(TEST_SID);

beforeEach(() => {
  mockReducedMotion(false);
  useTranscripts.setState({ sessions: {} });
  useSessionsStore.getState().reset();
  seedWorkspace();
});
afterEach(() => {
  clearMocks();
  resetWorkspaceForTests();
});

function mockPanelIpc(onSpawn: (spec: Record<string, unknown>) => void) {
  mockIPC((cmd, args) => {
    if (cmd === "list_all_sessions") return [];
    if (cmd === "get_session_transcript") {
      const { limit } = args as { limit: number };
      if (limit === 0) return { items: [], total: 2 };
      return {
        items: [
          { seq: 0, item: user("before checkpoint") },
          { seq: 1, item: checkpoint("ckpt-7") },
        ],
        total: 2,
      };
    }
    if (cmd === "spawn_session") {
      onSpawn((args as { spec: Record<string, unknown> }).spec);
      return { provider: "claude-code", id: "rewound-1" };
    }
    return null;
  });
}

test("checkpoint renders as a subtle timeline marker", async () => {
  mockPanelIpc(() => {});
  render(
    <ChatPanel leafId="l1" params={{ sessionId: KEY, projectPath: "/work/proj" }} setParams={vi.fn()} />,
  );
  await screen.findByTestId("checkpoint-marker");
  expect(screen.getByTestId("checkpoint-marker")).toHaveTextContent("📍 checkpoint");
});

test("rewind: confirm dialog → spawnSession fork opens a NEW annotated panel", async () => {
  const specs: Array<Record<string, unknown>> = [];
  mockPanelIpc((s) => specs.push(s));
  render(
    <ChatPanel leafId="l1" params={{ sessionId: KEY, projectPath: "/work/proj" }} setParams={vi.fn()} />,
  );
  await screen.findByTestId("checkpoint-rewind");
  await userEvent.click(screen.getByTestId("checkpoint-rewind"));
  // confirm step before anything spawns
  expect(specs).toHaveLength(0);
  await screen.findByTestId("checkpoint-confirm");
  await userEvent.click(screen.getByTestId("checkpoint-confirm-yes"));
  await waitFor(() => expect(specs).toHaveLength(1));
  expect(specs[0]?.resume_session).toBe(TEST_SID.id);
  expect(specs[0]?.fork).toBe(true);
  // the fork lands in a new workspace chat panel, annotated (Lane B parked #3)
  await waitFor(() =>
    expect(chatLeaves()[0]?.params).toMatchObject({
      sessionId: "claude-code:rewound-1",
      note: "⏪ rewind @ ckpt-7",
    }),
  );
});

test("cancel keeps everything untouched", async () => {
  const specs: Array<Record<string, unknown>> = [];
  mockPanelIpc((s) => specs.push(s));
  render(
    <ChatPanel leafId="l1" params={{ sessionId: KEY, projectPath: "/work/proj" }} setParams={vi.fn()} />,
  );
  await screen.findByTestId("checkpoint-rewind");
  await userEvent.click(screen.getByTestId("checkpoint-rewind"));
  await userEvent.click(screen.getByText("Cancel"));
  expect(specs).toHaveLength(0);
  expect(screen.queryByTestId("checkpoint-confirm")).not.toBeInTheDocument();
});

test("no checkpoint items → no markers, no UI residue", async () => {
  mockIPC((cmd) => {
    if (cmd === "list_all_sessions") return [];
    if (cmd === "get_session_transcript") return { items: [{ seq: 0, item: user("plain") }], total: 1 };
    return null;
  });
  render(
    <ChatPanel leafId="l1" params={{ sessionId: KEY, projectPath: "/work/proj" }} setParams={vi.fn()} />,
  );
  await screen.findByText("plain");
  expect(screen.queryByTestId("checkpoint-marker")).not.toBeInTheDocument();
});

test("marker without a chat context renders without the rewind affordance", () => {
  render(<CheckpointMarker seq={0} item={checkpoint("c1")} />);
  expect(screen.getByTestId("checkpoint-marker")).toBeInTheDocument();
  expect(screen.queryByTestId("checkpoint-rewind")).not.toBeInTheDocument();
});

test("panel note renders in the meta strip", async () => {
  mockIPC((cmd) => {
    if (cmd === "list_all_sessions") return [];
    if (cmd === "get_session_transcript") return { items: [], total: 0 };
    return null;
  });
  render(
    <ChatPanel leafId="l1" params={{ sessionId: KEY, note: "⏪ rewind @ ckpt-7" }} setParams={vi.fn()} />,
  );
  expect(await screen.findByTestId("panel-note")).toHaveTextContent("⏪ rewind @ ckpt-7");
});

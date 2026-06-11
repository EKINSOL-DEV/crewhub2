// T13 (EKI-49): VirtualTranscript smoke — store-driven render, empty state,
// scroll-up paging trigger. Frame-time behavior lives in the ?perf probe.
import { mockReducedMotion, TEST_SID, user, assistant, toolUse, toolResult } from "./chat-helpers";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { fireEvent, render, screen } from "@testing-library/react";
import { useTranscripts } from "@/stores/transcripts";
import { VirtualTranscript } from "@/panels/chat/VirtualTranscript";

beforeEach(() => {
  mockReducedMotion(false);
  useTranscripts.setState({ sessions: {} });
});
afterEach(clearMocks);

test("renders items from the stitch buffer through the renderer table", () => {
  const s = useTranscripts.getState();
  s.ingestPage(TEST_SID, {
    items: [
      { seq: 0, item: user("hello there") },
      { seq: 1, item: toolUse("Read", `{"file_path":"a.rs"}`, "t1") },
      { seq: 2, item: toolResult("t1", "ok") },
      { seq: 3, item: assistant("done and dusted") },
    ],
    total: 4,
  });
  render(<VirtualTranscript sid={TEST_SID} />);
  expect(screen.getByText("hello there")).toBeInTheDocument();
  expect(screen.getByText("done and dusted")).toBeInTheDocument();
  expect(screen.getAllByTestId("tool-card")).toHaveLength(1); // result joined to use
});

test("opened empty session shows the Quiet Office empty state", () => {
  useTranscripts.getState().ingestPage(TEST_SID, { items: [], total: 0 });
  render(<VirtualTranscript sid={TEST_SID} />);
  expect(screen.getByTestId("empty-state")).toHaveTextContent("Nobody's talking yet");
});

test("scrolling near the top pages older history (gap below lowest seq)", () => {
  const calls: Array<{ offset: number; limit: number }> = [];
  mockIPC((cmd, args) => {
    if (cmd !== "get_session_transcript") return null;
    const { offset, limit } = args as { offset: number; limit: number };
    calls.push({ offset, limit });
    return { items: [], total: 500 };
  });
  useTranscripts.getState().ingestPage(TEST_SID, {
    items: [
      { seq: 300, item: user("old") },
      { seq: 301, item: assistant("new") },
    ],
    total: 500,
  });
  render(<VirtualTranscript sid={TEST_SID} />);
  fireEvent.scroll(screen.getByTestId("virtual-transcript"), { target: { scrollTop: 0 } });
  expect(calls).toEqual([{ offset: 100, limit: 200 }]);
});

test("at seq 0 no further paging is requested", () => {
  const calls: string[] = [];
  mockIPC((cmd) => {
    calls.push(cmd);
    return { items: [], total: 2 };
  });
  useTranscripts.getState().ingestPage(TEST_SID, {
    items: [{ seq: 0, item: user("first") }],
    total: 2,
  });
  render(<VirtualTranscript sid={TEST_SID} />);
  fireEvent.scroll(screen.getByTestId("virtual-transcript"), { target: { scrollTop: 0 } });
  expect(calls).toEqual([]);
});

test("subagent group renders collapsed with humanized name and expands", () => {
  useTranscripts.getState().ingestPage(TEST_SID, {
    items: [{ seq: 0, item: user("parent msg", 10) }],
    total: 1,
  });
  render(
    <VirtualTranscript
      sid={TEST_SID}
      groups={[
        {
          key: "sub-1",
          name: "Swift Otter",
          firstTs: 20,
          entries: [{ type: "item", key: "c0", seq: 0, item: assistant("child work", 20) }],
        },
      ]}
    />,
  );
  expect(screen.getByTestId("subagent-group")).toHaveTextContent("Swift Otter");
  expect(screen.queryByText("child work")).not.toBeInTheDocument();
  fireEvent.click(screen.getByTestId("subagent-toggle"));
  expect(screen.getByText("child work")).toBeInTheDocument();
});

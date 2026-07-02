// M2 T3: use-chat-session + ChatWindow. Stores are mocked wholesale (per
// the M2 dispatch) rather than driven through the real transcripts/sessions
// stores — this is a unit test of the projection + composer, not an
// integration test of the store stitch (that's lines.test.ts/store.test.ts's
// job already).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { PermissionRequest, QuestionRequest, SessionMeta } from "@/ipc/bindings";
import type { SessionTranscript } from "@/stores/transcripts";
import type { SessionView } from "@/stores/sessions";

const { transcripts, openSessionSpy, startTranscriptStreamSpy, sendToSessionSpy, views } = vi.hoisted(() => ({
  transcripts: { sessions: {} as Record<string, SessionTranscript> },
  openSessionSpy: vi.fn(),
  startTranscriptStreamSpy: vi.fn(),
  sendToSessionSpy: vi.fn(async () => ({ status: "ok" as const, data: null })),
  views: { current: [] as SessionView[] },
}));

vi.mock("@/stores/transcripts", () => ({
  useTranscripts: Object.assign((selector: (s: typeof transcripts) => unknown) => selector(transcripts), {
    getState: () => ({ ...transcripts, openSession: openSessionSpy }),
  }),
  startTranscriptStream: startTranscriptStreamSpy,
}));

vi.mock("@/stores/sessions", () => ({
  useSessionsView: () => views.current,
}));

vi.mock("@/ipc/bindings", () => ({
  commands: { sendToSession: sendToSessionSpy },
}));

import { parseSessionKey } from "./use-chat-session";
import { ChatWindow } from "./ChatWindow";

function transcript(
  items: [number, { kind: string; data: Record<string, unknown> }][],
  order: number[],
  pending: Partial<Pick<SessionTranscript, "pendingPermissions" | "pendingQuestions">> = {},
): SessionTranscript {
  return {
    items: new Map(items as never),
    order,
    total: order.length,
    loadingOlder: false,
    opened: true,
    pendingPermissions: [],
    pendingQuestions: [],
    receipts: [],
    ...pending,
  };
}

function meta(over: Partial<SessionMeta> = {}): SessionMeta {
  return {
    id: { provider: "claude", id: "s1" },
    origin: "Managed",
    project_path: "/tmp/proj",
    model: null,
    status: "Working",
    activity_detail: null,
    parent: null,
    team: null,
    usage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0 },
    git_branch: null,
    last_activity_ms: Date.now(),
    ...over,
  };
}

function view(over: Partial<SessionMeta> = {}): SessionView {
  return { key: "claude:s1", meta: meta(over), binding: null, agent: null, room: null, displayName: "Rex" };
}

const PENDING_PERMISSION: PermissionRequest = {
  request_id: "r1",
  tool: "Bash",
  input_json: "{}",
  suggestions: [],
};

const PENDING_QUESTION: QuestionRequest = {
  request_id: "q1",
  kind: "question",
  text: "Pick one",
  options: ["a", "b"],
  multi_select: false,
};

const WINDOW_PROPS = {
  chatKey: "claude:s1",
  name: "Rex",
  color: "#22c55e",
  minimized: false,
  stackIndex: 0,
  onClose: () => {},
  onMinimize: () => {},
  onFocusChat: () => {},
};

beforeEach(() => {
  transcripts.sessions = {};
  views.current = [];
  openSessionSpy.mockClear();
  startTranscriptStreamSpy.mockClear();
  sendToSessionSpy.mockClear();
});

describe("parseSessionKey", () => {
  it("splits on the first colon only — ids may themselves contain ':'", () => {
    expect(parseSessionKey("claude:sess:with:colons")).toEqual({
      provider: "claude",
      id: "sess:with:colons",
    });
    expect(parseSessionKey("agent:abc")).toEqual({ provider: "agent", id: "abc" });
  });
});

describe("ChatWindow", () => {
  it("renders mapped lines: user right, bot left, note centered", () => {
    transcripts.sessions["claude:s1"] = transcript(
      [
        [1, { kind: "UserText", data: { text: "hi", ts: 1 } }],
        [2, { kind: "AssistantText", data: { text: "hello", ts: 2 } }],
        [3, { kind: "SystemNote", data: { text: "a note", ts: 3 } }],
      ],
      [1, 2, 3],
    );
    render(<ChatWindow {...WINDOW_PROPS} />);
    expect(screen.getByText("hi").dataset.who).toBe("user");
    expect(screen.getByText("hello").dataset.who).toBe("bot");
    expect(screen.getByText("a note").dataset.who).toBe("note");
  });

  it("starts the transcript stream and opens the session once on mount", () => {
    render(<ChatWindow {...WINDOW_PROPS} />);
    expect(startTranscriptStreamSpy).toHaveBeenCalledTimes(1);
    expect(openSessionSpy).toHaveBeenCalledWith({ provider: "claude", id: "s1" });
  });

  it("Enter sends the trimmed draft via sendToSession(parsed id) and clears the input", () => {
    render(<ChatWindow {...WINDOW_PROPS} />);
    const input = screen.getByTestId("chat-window-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  hello there  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(sendToSessionSpy).toHaveBeenCalledWith({ provider: "claude", id: "s1" }, "hello there");
    expect(input.value).toBe("");
  });

  it("ignores empty/whitespace-only input", () => {
    render(<ChatWindow {...WINDOW_PROPS} />);
    const input = screen.getByTestId("chat-window-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(sendToSessionSpy).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(sendToSessionSpy).not.toHaveBeenCalled();
  });

  it("disables the composer once the session has Ended", () => {
    views.current = [view({ status: "Ended" })];
    render(<ChatWindow {...WINDOW_PROPS} />);
    const input = screen.getByTestId("chat-window-input") as HTMLInputElement;
    expect(input).toBeDisabled();
    expect(input.placeholder).toBe("session ended");
    expect(screen.getByTestId("chat-window-send")).toBeDisabled();
  });

  it("renders a minimized chip that un-minimizes and focuses the chat on click", () => {
    const onMinimize = vi.fn();
    const onFocusChat = vi.fn();
    render(<ChatWindow {...WINDOW_PROPS} minimized onMinimize={onMinimize} onFocusChat={onFocusChat} />);
    fireEvent.click(screen.getByRole("button", { name: /open chat with rex/i }));
    expect(onMinimize).toHaveBeenCalledWith(false);
    expect(onFocusChat).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("chat-window-input")).not.toBeInTheDocument();
  });

  it("wires pending permissions and questions into PermissionCard/QuestionCard", () => {
    transcripts.sessions["claude:s1"] = transcript([], [], {
      pendingPermissions: [PENDING_PERMISSION],
      pendingQuestions: [PENDING_QUESTION],
    });
    render(<ChatWindow {...WINDOW_PROPS} />);
    expect(screen.getByText("Bash")).toBeInTheDocument();
    expect(screen.getByText("Pick one")).toBeInTheDocument();
  });

  it("shows the minimized chip's ping dot when prompts are pending", () => {
    transcripts.sessions["claude:s1"] = transcript([], [], {
      pendingPermissions: [PENDING_PERMISSION],
      pendingQuestions: [PENDING_QUESTION],
    });
    render(<ChatWindow {...WINDOW_PROPS} minimized />);
    expect(screen.getByTestId("chat-chip-ping")).toBeInTheDocument();
  });
});

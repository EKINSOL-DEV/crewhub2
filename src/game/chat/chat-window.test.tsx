// M2 T3: use-chat-session + ChatWindow. Stores are mocked wholesale (per
// the M2 dispatch) rather than driven through the real transcripts/sessions
// stores — this is a unit test of the projection + composer, not an
// integration test of the store stitch (that's lines.test.ts/store.test.ts's
// job already).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Agent, PermissionRequest, QuestionRequest, SessionMeta } from "@/ipc/bindings";
import type { SessionTranscript } from "@/stores/transcripts";
import type { SessionView } from "@/stores/sessions";

type SendResult = { status: "ok"; data: null } | { status: "error"; error: string };

const {
  transcripts,
  openSessionSpy,
  startTranscriptStreamSpy,
  sendToSessionSpy,
  spawnSessionSpy,
  getSpawnProviderSpy,
  upsertSpy,
  views,
} = vi.hoisted(() => ({
  transcripts: { sessions: {} as Record<string, SessionTranscript> },
  openSessionSpy: vi.fn(),
  startTranscriptStreamSpy: vi.fn(),
  sendToSessionSpy: vi.fn(async (): Promise<SendResult> => ({ status: "ok", data: null })),
  spawnSessionSpy: vi.fn(),
  getSpawnProviderSpy: vi.fn(),
  upsertSpy: vi.fn(),
  views: { current: [] as SessionView[] },
}));

vi.mock("@/stores/transcripts", () => ({
  useTranscripts: Object.assign((selector: (s: typeof transcripts) => unknown) => selector(transcripts), {
    getState: () => ({ ...transcripts, openSession: openSessionSpy }),
  }),
  startTranscriptStream: startTranscriptStreamSpy,
  // hire.ts's sessionKey — real logic, not a spy; "provider:id" is what
  // ChatWindows.tsx/store.ts key open chats by too.
  sessionKey: (id: { provider: string; id: string }) => `${id.provider}:${id.id}`,
}));

vi.mock("@/stores/sessions", () => ({
  useSessionsView: () => views.current,
}));

// hireAgent (hire.ts, driven by the Ended-composer "Wake up" flow) touches
// these two stores — mocked wholesale, same convention as
// hire-dialog.test.tsx, so hire.ts itself stays real/unmocked here too.
vi.mock("@/stores/agents", () => ({
  useAgentsStore: { getState: () => ({ getSpawnProvider: getSpawnProviderSpy }) },
}));
vi.mock("@/stores/bindings", () => ({
  useBindingsStore: Object.assign(
    (selector: (s: { bindings: Record<string, never> }) => unknown) => selector({ bindings: {} }),
    {
      getState: () => ({ upsert: upsertSpy }),
    },
  ),
}));

vi.mock("@/ipc/bindings", () => ({
  commands: { sendToSession: sendToSessionSpy, spawnSession: spawnSessionSpy },
}));

import { parseSessionKey } from "./use-chat-session";
import { ChatWindow } from "./ChatWindow";
import { useGameChats } from "./store";

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

function view(over: Partial<SessionMeta> = {}, agent: Agent | null = null): SessionView {
  return { key: "claude:s1", meta: meta(over), binding: null, agent, room: null, displayName: "Rex" };
}

function agent(over: Partial<Agent> & { id: string; name: string }): Agent {
  return {
    icon: null,
    color: "#fff",
    avatar: null,
    default_model: "haiku",
    project_path: "/work/proj",
    permission_mode: "Default",
    system_prompt: null,
    persona_json: null,
    is_pinned: false,
    auto_spawn: false,
    bio: null,
    created_at: 0,
    updated_at: 0,
    ...over,
  };
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
  spawnSessionSpy.mockReset();
  getSpawnProviderSpy.mockReset();
  upsertSpy.mockReset();
  useGameChats.setState({ chats: [] });
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

  it("ignores empty/whitespace-only input and leaves the draft untouched", () => {
    render(<ChatWindow {...WINDOW_PROPS} />);
    const input = screen.getByTestId("chat-window-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(sendToSessionSpy).not.toHaveBeenCalled();
    expect(input.value).toBe("   ");

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(sendToSessionSpy).not.toHaveBeenCalled();
    expect(input.value).toBe("");
  });

  it("clears the draft optimistically and shows no error on a successful send", async () => {
    render(<ChatWindow {...WINDOW_PROPS} />);
    const input = screen.getByTestId("chat-window-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "hello there" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input.value).toBe("");
    await vi.waitFor(() => expect(sendToSessionSpy).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("chat-window-error")).not.toBeInTheDocument();
  });

  it("shows an inline error and restores the draft when sendToSession fails", async () => {
    sendToSessionSpy.mockResolvedValueOnce({ status: "error" as const, error: "boom" });
    render(<ChatWindow {...WINDOW_PROPS} />);
    const input = screen.getByTestId("chat-window-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "hello there" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input.value).toBe("");

    expect(await screen.findByTestId("chat-window-error")).toHaveTextContent("boom");
    expect(input.value).toBe("hello there");
  });

  it("dismisses the send error once the draft changes", async () => {
    sendToSessionSpy.mockResolvedValueOnce({ status: "error" as const, error: "boom" });
    render(<ChatWindow {...WINDOW_PROPS} />);
    const input = screen.getByTestId("chat-window-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "hello there" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await screen.findByTestId("chat-window-error")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "hello there!" } });
    expect(screen.queryByTestId("chat-window-error")).not.toBeInTheDocument();
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

  it("demo mode shows the note, disables the composer, and never opens a session", () => {
    render(<ChatWindow {...WINDOW_PROPS} chatKey="demo:ada" name="Ada" demo />);
    expect(screen.getByTestId("chat-window-demo-note")).toHaveTextContent(
      "demo thread — hire a real robot to chat",
    );
    const input = screen.getByTestId("chat-window-input") as HTMLInputElement;
    expect(input).toBeDisabled();
    expect(input.placeholder).toBe("demo thread");
    expect(screen.getByTestId("chat-window-send")).toBeDisabled();
    expect(openSessionSpy).not.toHaveBeenCalled();
    expect(startTranscriptStreamSpy).not.toHaveBeenCalled();
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

  // M4 debt sweep: Ended + an agent binding wakes the composer back up
  // instead of leaving it a dead end (port of the deleted world's
  // WorldChatWindow.wakeAndSend).
  describe("Ended composer wake-up", () => {
    const scout = agent({ id: "a1", name: "Scout", default_model: "opus" });

    it("shows a Wake up button (not Send) instead of disabling the composer", () => {
      views.current = [view({ status: "Ended" }, scout)];
      render(<ChatWindow {...WINDOW_PROPS} />);
      const input = screen.getByTestId("chat-window-input") as HTMLInputElement;
      expect(input).not.toBeDisabled();
      expect(input.placeholder).toBe("Wake Rex with…");
      expect(screen.queryByTestId("chat-window-send")).not.toBeInTheDocument();
      expect(screen.getByTestId("chat-window-wake")).toBeInTheDocument();
    });

    it("Wake up is disabled until there's a draft to send", () => {
      views.current = [view({ status: "Ended" }, scout)];
      render(<ChatWindow {...WINDOW_PROPS} />);
      expect(screen.getByTestId("chat-window-wake")).toBeDisabled();
      fireEvent.change(screen.getByTestId("chat-window-input"), { target: { value: "rise and shine" } });
      expect(screen.getByTestId("chat-window-wake")).not.toBeDisabled();
    });

    it("spawns the agent with the draft as its prompt, and re-keys the window onto the fresh session", async () => {
      views.current = [view({ status: "Ended" }, scout)];
      getSpawnProviderSpy.mockResolvedValue("claude-code");
      spawnSessionSpy.mockResolvedValue({ status: "ok", data: { provider: "claude-code", id: "s-new" } });
      useGameChats.getState().open("claude:s1");

      render(<ChatWindow {...WINDOW_PROPS} />);
      const input = screen.getByTestId("chat-window-input") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "rise and shine" } });
      fireEvent.click(screen.getByTestId("chat-window-wake"));
      expect(input.value).toBe("");

      await vi.waitFor(() => expect(spawnSessionSpy).toHaveBeenCalledTimes(1));
      expect(spawnSessionSpy).toHaveBeenCalledWith(
        "claude-code",
        expect.objectContaining({ project_path: "/work/proj", model: "opus", prompt: "rise and shine" }),
      );
      expect(upsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({ session_id: "s-new", agent_id: "a1" }),
      );
      await vi.waitFor(() =>
        expect(useGameChats.getState().chats.map((c) => c.key)).toEqual(["claude-code:s-new"]),
      );
    });

    it("Enter in the composer also wakes the agent", async () => {
      views.current = [view({ status: "Ended" }, scout)];
      getSpawnProviderSpy.mockResolvedValue("claude-code");
      spawnSessionSpy.mockResolvedValue({ status: "ok", data: { provider: "claude-code", id: "s-new" } });

      render(<ChatWindow {...WINDOW_PROPS} />);
      const input = screen.getByTestId("chat-window-input");
      fireEvent.change(input, { target: { value: "rise and shine" } });
      fireEvent.keyDown(input, { key: "Enter" });

      await vi.waitFor(() => expect(spawnSessionSpy).toHaveBeenCalledTimes(1));
    });

    it("shows an inline error and restores the draft when the spawn fails", async () => {
      views.current = [view({ status: "Ended" }, scout)];
      getSpawnProviderSpy.mockResolvedValue("claude-code");
      spawnSessionSpy.mockResolvedValue({ status: "error", error: "no engine" });

      render(<ChatWindow {...WINDOW_PROPS} />);
      const input = screen.getByTestId("chat-window-input") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "rise and shine" } });
      fireEvent.click(screen.getByTestId("chat-window-wake"));

      expect(await screen.findByTestId("chat-window-error")).toHaveTextContent("no engine");
      expect(input.value).toBe("rise and shine");
      expect(upsertSpy).not.toHaveBeenCalled();
    });

    it("stays disabled (no Wake up button) for an Ended session with no agent binding", () => {
      views.current = [view({ status: "Ended" }, null)];
      render(<ChatWindow {...WINDOW_PROPS} />);
      expect(screen.getByTestId("chat-window-input")).toBeDisabled();
      expect(screen.queryByTestId("chat-window-wake")).not.toBeInTheDocument();
      expect(screen.getByTestId("chat-window-send")).toBeDisabled();
    });
  });
});

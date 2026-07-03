// M2 T3: use-chat-session + ChatWindow. Stores are mocked wholesale (per
// the M2 dispatch) rather than driven through the real transcripts/sessions
// stores — this is a unit test of the projection + composer, not an
// integration test of the store stitch (that's lines.test.ts/store.test.ts's
// job already).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { Agent, PermissionRequest, Project, QuestionRequest, SessionMeta } from "@/ipc/bindings";
import type { SessionTranscript } from "@/stores/transcripts";
import type { SessionView } from "@/stores/sessions";

type SendResult = { status: "ok"; data: null } | { status: "error"; error: string };

const {
  transcripts,
  openSessionSpy,
  loadOlderSpy,
  startTranscriptStreamSpy,
  sendToSessionSpy,
  spawnSessionSpy,
  getSpawnProviderSpy,
  upsertSpy,
  views,
} = vi.hoisted(() => ({
  transcripts: { sessions: {} as Record<string, SessionTranscript> },
  openSessionSpy: vi.fn(),
  loadOlderSpy: vi.fn(),
  startTranscriptStreamSpy: vi.fn(),
  sendToSessionSpy: vi.fn(async (): Promise<SendResult> => ({ status: "ok", data: null })),
  spawnSessionSpy: vi.fn(),
  getSpawnProviderSpy: vi.fn(),
  upsertSpy: vi.fn(),
  views: { current: [] as SessionView[] },
}));

vi.mock("@/stores/transcripts", () => ({
  useTranscripts: Object.assign((selector: (s: typeof transcripts) => unknown) => selector(transcripts), {
    getState: () => ({ ...transcripts, openSession: openSessionSpy, loadOlder: loadOlderSpy }),
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

// M7 T3: the intent/command plumbing is exercised through its real, pure
// modules (parseIntent, linkedRoomsFromCampus's own layout/buildings reads) —
// only the far side of each boundary is mocked: the sim (outside <Canvas>,
// same cross-boundary reason command-bus.ts exists), the speech-bubble store
// (asserted on directly rather than re-deriving bubble state here), the
// Haiku fallback (its own wiring is interpret.test.ts's job), and sfx.
vi.mock("@/game/sim/command-bus", () => ({ postCommand: vi.fn() }));
vi.mock("./use-speech-bubbles", () => ({ pushLocalBubble: vi.fn() }));
vi.mock("@/game/intents/interpret", () => ({ interpretIntent: vi.fn(async () => null) }));
vi.mock("@/game/audio/sfx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/game/audio/sfx")>();
  return { ...actual, playSfx: vi.fn() };
});

import { interpretIntent } from "@/game/intents/interpret";
import { playSfx } from "@/game/audio/sfx";
import { EMPTY_EDITS } from "@/game/build/edits";
import { resetCampusEditsForTests, useCampusEdits } from "@/game/build/store";
import { resetProjectsForTests, useProjectsStore } from "@/stores/projects";
import { postCommand } from "@/game/sim/command-bus";
import {
  linkedRoomsFromCampus,
  parseSessionKey,
  useChatSession,
  type ChatSessionResult,
} from "./use-chat-session";
import { ChatWindow } from "./ChatWindow";
import { useGameChats } from "./store";
import { pushLocalBubble } from "./use-speech-bubbles";

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
  loadOlderSpy.mockClear();
  startTranscriptStreamSpy.mockClear();
  sendToSessionSpy.mockClear();
  spawnSessionSpy.mockReset();
  getSpawnProviderSpy.mockReset();
  upsertSpy.mockReset();
  useGameChats.setState({ chats: [], localLines: {} });
  vi.mocked(postCommand).mockClear();
  vi.mocked(pushLocalBubble).mockClear();
  vi.mocked(interpretIntent).mockReset().mockResolvedValue(null);
  vi.mocked(playSfx).mockClear();
  resetCampusEditsForTests();
  resetProjectsForTests();
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

  it("backfills the transcript head when the lowest loaded seq is above 0 (fresh-spawn race)", () => {
    // The spawn prompt (seq 0) can be written before the watcher attaches; a
    // live-only buffer then starts at seq 1 and the first message never shows.
    transcripts.sessions["claude:s1"] = transcript(
      [[1, { kind: "AssistantText", data: { text: "hello", ts: 2 } }]],
      [1],
    );
    render(<ChatWindow {...WINDOW_PROPS} />);
    expect(loadOlderSpy).toHaveBeenCalledWith({ provider: "claude", id: "s1" });
  });

  it("does not backfill when seq 0 is already loaded", () => {
    transcripts.sessions["claude:s1"] = transcript(
      [[0, { kind: "UserText", data: { text: "hi", ts: 1 } }]],
      [0],
    );
    render(<ChatWindow {...WINDOW_PROPS} />);
    expect(loadOlderSpy).not.toHaveBeenCalled();
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

  it("demo mode shows a command hint (not disabled) and never opens a session", () => {
    render(<ChatWindow {...WINDOW_PROPS} chatKey="demo:ada" name="Ada" demo />);
    expect(screen.getByTestId("chat-window-demo-note")).toHaveTextContent(
      'demo thread — try "go to hq" or "dance"',
    );
    // M7 T3: the demo composer is no longer a hard dead end — a typed
    // command still reaches the real sim (see the "M7 T3 chat wiring"
    // describe block below) — so unlike the pre-M7 behavior, it's enabled.
    const input = screen.getByTestId("chat-window-input") as HTMLInputElement;
    expect(input).not.toBeDisabled();
    expect(input.placeholder).toContain("go to HQ");
    expect(screen.getByTestId("chat-window-send")).not.toBeDisabled();
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

function fakeProject(overrides: Partial<Project> & { id: string }): Project {
  return {
    name: "Untitled",
    description: null,
    icon: null,
    color: null,
    folder_path: "/repo/untitled",
    docs_path: null,
    status: "active",
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

describe("linkedRoomsFromCampus", () => {
  it("returns nothing when no plot or placed pavilion is linked", () => {
    expect(linkedRoomsFromCampus(EMPTY_EDITS, [])).toEqual([]);
  });

  it("joins a linked plot to its project's name under a 'plot:N' buildingKey", () => {
    const edits = { ...EMPTY_EDITS, plotProjects: { 0: "proj-1" } };
    const rooms = linkedRoomsFromCampus(edits, [fakeProject({ id: "proj-1", name: "Website Redesign" })]);
    expect(rooms).toEqual([{ buildingKey: "plot:0", name: "Website Redesign", door: expect.any(Object) }]);
  });

  it("joins a linked player-built pavilion under its own id as buildingKey", () => {
    const edits = {
      ...EMPTY_EDITS,
      buildings: [{ id: "e3", x: 10, z: -20, w: 8, d: 6, roomId: null, projectId: "proj-2" }],
    };
    const rooms = linkedRoomsFromCampus(edits, [fakeProject({ id: "proj-2", name: "Mobile App" })]);
    expect(rooms).toEqual([{ buildingKey: "e3", name: "Mobile App", door: expect.any(Object) }]);
  });

  it("skips a plot/building link whose project id isn't in the projects list (stale link)", () => {
    const edits = { ...EMPTY_EDITS, plotProjects: { 0: "gone" } };
    expect(linkedRoomsFromCampus(edits, [])).toEqual([]);
  });

  it("skips an unlinked player-built pavilion (projectId null)", () => {
    const edits = {
      ...EMPTY_EDITS,
      buildings: [{ id: "e1", x: 0, z: -20, w: 8, d: 6, roomId: null, projectId: null }],
    };
    expect(linkedRoomsFromCampus(edits, [fakeProject({ id: "proj-1", name: "X" })])).toEqual([]);
  });
});

// M7 T3 — the interception matrix the brief calls out: a recognized command
// always short-circuits to the sim (live or not); prose only ever reaches
// sendToSession when there's a live session; a session-less bot (resting
// crew, or Ended) asks the Haiku fallback instead of leaving the message
// stranded; a demo bot's non-command chatter is a deliberate no-op (it isn't
// a real agent — see use-chat-session.ts's isDemoKey branch).
describe("M7 T3 chat wiring", () => {
  it("a recognized command posts to the sim and never touches sendToSession, even with a live session", () => {
    views.current = [view({ status: "Working" })];
    render(<ChatWindow {...WINDOW_PROPS} />);
    const input = screen.getByTestId("chat-window-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "go to hq" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(postCommand).toHaveBeenCalledWith("claude:s1", { kind: "goto", x: 0, z: 0 });
    expect(sendToSessionSpy).not.toHaveBeenCalled();
    expect(pushLocalBubble).toHaveBeenCalledWith("claude:s1", "On my way! 🏃");
    expect(playSfx).toHaveBeenCalledWith("send");
    expect(screen.getByText("🏃 heading to HQ").dataset.who).toBe("note");
  });

  it("ordinary prose with a live session still goes through sendToSession, unchanged", () => {
    // Covered end-to-end already by the plain "Enter sends..." test above —
    // "hello there" doesn't match any command pattern, so it falls all the
    // way through to the pre-existing sendToSession path untouched.
    views.current = [view({ status: "Working" })];
    render(<ChatWindow {...WINDOW_PROPS} />);
    const input = screen.getByTestId("chat-window-input");
    fireEvent.change(input, { target: { value: "let's go to production" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(sendToSessionSpy).toHaveBeenCalledWith({ provider: "claude", id: "s1" }, "let's go to production");
    expect(postCommand).not.toHaveBeenCalled();
    expect(interpretIntent).not.toHaveBeenCalled();
  });

  it("a demo bot still runs commands — the sim is real even for a fake bot", () => {
    render(<ChatWindow {...WINDOW_PROPS} chatKey="demo:ada" name="Ada" demo />);
    const input = screen.getByTestId("chat-window-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "dance" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(postCommand).toHaveBeenCalledWith("demo:ada", { kind: "emote", emote: "dance" });
    expect(pushLocalBubble).toHaveBeenCalledWith("demo:ada", "💃");
    expect(screen.getByText("💃 dance").dataset.who).toBe("note");
    expect(sendToSessionSpy).not.toHaveBeenCalled();
  });

  it("a demo bot's non-command chatter is a silent no-op — no interpretIntent, no sendToSession", () => {
    render(<ChatWindow {...WINDOW_PROPS} chatKey="demo:ada" name="Ada" demo />);
    const input = screen.getByTestId("chat-window-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "hello there" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(interpretIntent).not.toHaveBeenCalled();
    expect(sendToSessionSpy).not.toHaveBeenCalled();
    expect(postCommand).not.toHaveBeenCalled();
    // Still shows the empty-thread hint — nothing was added to the chat.
    expect(screen.getByTestId("chat-window-demo-note")).toBeInTheDocument();
  });

  function SessionProbe({
    chatKey,
    onSession,
  }: {
    chatKey: string;
    onSession: (r: ChatSessionResult) => void;
  }) {
    const session = useChatSession(chatKey);
    onSession(session);
    return null;
  }

  it("a session-less crew member ('agent:*' key, no live session) with a 'say' reply gets a bubble + bot line", async () => {
    vi.mocked(interpretIntent).mockResolvedValueOnce({ kind: "say", text: "Ask me after lunch!" });
    let session: ChatSessionResult | null = null;
    render(<SessionProbe chatKey="agent:scout" onSession={(s) => (session = s)} />);

    await act(async () => {
      await session!.send("tell me a joke");
    });

    expect(sendToSessionSpy).not.toHaveBeenCalled();
    expect(interpretIntent).toHaveBeenCalledWith("tell me a joke", { rooms: [] });
    expect(pushLocalBubble).toHaveBeenCalledWith("agent:scout", "Ask me after lunch!");
    expect(useGameChats.getState().localLines["agent:scout"]).toEqual([
      expect.objectContaining({ who: "bot", text: "Ask me after lunch!" }),
    ]);
  });

  it("a session-less bot with no recognizable intent gets the scratches-head note", async () => {
    vi.mocked(interpretIntent).mockResolvedValueOnce(null);
    let session: ChatSessionResult | null = null;
    render(<SessionProbe chatKey="agent:scout" onSession={(s) => (session = s)} />);

    await act(async () => {
      await session!.send("what's the weather like");
    });

    expect(useGameChats.getState().localLines["agent:scout"]).toEqual([
      expect.objectContaining({ who: "note", text: "🤖 …scratches head…" }),
    ]);
  });

  it("an Ended session also falls back to interpretIntent instead of sendToSession", async () => {
    views.current = [view({ status: "Ended" })];
    vi.mocked(interpretIntent).mockResolvedValueOnce({ kind: "emote", emote: "wave" });
    let session: ChatSessionResult | null = null;
    render(<SessionProbe chatKey="claude:s1" onSession={(s) => (session = s)} />);

    await act(async () => {
      await session!.send("say hi");
    });

    expect(sendToSessionSpy).not.toHaveBeenCalled();
    expect(postCommand).toHaveBeenCalledWith("claude:s1", { kind: "emote", emote: "wave" });
  });

  it("merges local lines after transcript lines, in the order the commands were sent", () => {
    transcripts.sessions["claude:s1"] = transcript(
      [
        [1, { kind: "UserText", data: { text: "hi", ts: 1 } }],
        [2, { kind: "AssistantText", data: { text: "hello", ts: 2 } }],
      ],
      [1, 2],
    );
    views.current = [view({ status: "Working" })];
    const { container } = render(<ChatWindow {...WINDOW_PROPS} />);
    const input = screen.getByTestId("chat-window-input");
    fireEvent.change(input, { target: { value: "go to hq" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.change(input, { target: { value: "dance" } });
    fireEvent.keyDown(input, { key: "Enter" });

    const order = [...container.querySelectorAll("[data-who]")].map((el) => el.textContent);
    expect(order).toEqual(["hi", "hello", "🏃 heading to HQ", "💃 dance"]);
  });

  it("resolves a linked room target end-to-end: 'go to <project>' posts a goto to that room's door", () => {
    useCampusEdits.setState((s) => ({ edits: { ...s.edits, plotProjects: { 0: "proj-1" } } }));
    useProjectsStore.setState({
      projects: [
        {
          id: "proj-1",
          name: "Website Redesign",
          description: null,
          icon: null,
          color: null,
          folder_path: "/repo/website",
          docs_path: null,
          status: "active",
          created_at: 0,
          updated_at: 0,
        },
      ],
    });
    const room = linkedRoomsFromCampus(
      useCampusEdits.getState().edits,
      useProjectsStore.getState().projects,
    )[0]!;

    views.current = [view({ status: "Working" })];
    render(<ChatWindow {...WINDOW_PROPS} />);
    const input = screen.getByTestId("chat-window-input");
    fireEvent.change(input, { target: { value: "go to Website Redesign" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(postCommand).toHaveBeenCalledWith("claude:s1", { kind: "goto", x: room.door.x, z: room.door.z });
    expect(screen.getByText("🏃 heading to Website Redesign").dataset.who).toBe("note");
  });

  it("shows the composer hint for a normal (non-Ended, non-wake) chat", () => {
    render(<ChatWindow {...WINDOW_PROPS} />);
    expect((screen.getByTestId("chat-window-input") as HTMLInputElement).placeholder).toBe(
      'Message Rex… (try "go to HQ" or "dance")',
    );
  });
});

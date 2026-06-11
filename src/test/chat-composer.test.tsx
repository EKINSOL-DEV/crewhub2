// T14 (EKI-52): composer — send/newline, queue affordance, slash hints,
// spawn-from-chat with haiku default.
import { mockReducedMotion, TEST_SID, user } from "./chat-helpers";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SessionMeta } from "@/ipc/bindings";
import { useTranscripts } from "@/stores/transcripts";
import { useSessionsStore } from "@/stores/sessions";
import { Composer, slashToken } from "@/panels/chat/Composer";
import { SpawnFromChat } from "@/panels/chat/SpawnFromChat";
import { fuzzyFilter, fuzzyScore } from "@/panels/chat/fuzzy";

/** Chat reads session meta from the shared sessions store (T18) post-merge. */
function ingestMeta(m: SessionMeta): void {
  useSessionsStore.getState().apply({ type: "Updated", data: { meta: m } });
}

function meta(status: SessionMeta["status"]): SessionMeta {
  return {
    id: TEST_SID,
    origin: "Managed",
    project_path: "/work/proj",
    model: "haiku",
    status,
    activity_detail: null,
    parent: null,
    usage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0 },
    git_branch: null,
    last_activity_ms: 0,
  };
}

beforeEach(() => {
  mockReducedMotion(false);
  useTranscripts.setState({ sessions: {} });
  useSessionsStore.getState().reset();
});
afterEach(clearMocks);

describe("fuzzy", () => {
  test("subsequence match with prefix preference", () => {
    expect(fuzzyScore("rev", "review")).not.toBeNull();
    expect(fuzzyScore("xyz", "review")).toBeNull();
    const ranked = fuzzyFilter("re", [{ n: "deep-research" }, { n: "review" }], (x) => x.n);
    expect(ranked[0]?.n).toBe("review");
  });

  test("slashToken extraction", () => {
    expect(slashToken("/rev")).toBe("rev");
    expect(slashToken("/")).toBe("");
    expect(slashToken("hello /rev")).toBeNull();
    expect(slashToken("/cmd args")).toBeNull(); // token closed by a space
    expect(slashToken("/line\ntwo")).toBeNull();
  });
});

describe("Composer", () => {
  test("Enter sends via sendToSession; Shift+Enter does not", async () => {
    const sent: string[] = [];
    mockIPC((cmd, args) => {
      if (cmd === "send_to_session") sent.push((args as { text: string }).text);
      return null;
    });
    ingestMeta(meta("WaitingForInput"));
    render(<Composer sid={TEST_SID} />);
    const input = screen.getByTestId("composer-input");
    fireEvent.change(input, { target: { value: "hello agent" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(sent).toEqual([]);
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(sent).toEqual(["hello agent"]));
    expect((input as HTMLTextAreaElement).value).toBe("");
  });

  test("while Working the send button queues; chip clears when UserText streams back", async () => {
    mockIPC(() => null);
    ingestMeta(meta("Working"));
    render(<Composer sid={TEST_SID} />);
    expect(screen.getByTestId("composer-send")).toHaveTextContent("queue");
    const input = screen.getByTestId("composer-input");
    fireEvent.change(input, { target: { value: "queued message" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await screen.findByTestId("queued-chip");
    expect(screen.getByTestId("queued-chip")).toHaveTextContent("queued message");
    // the matching UserText item arrives from the engine
    useTranscripts.getState().ingestLive(TEST_SID, 0, user("queued message"));
    await waitFor(() => expect(screen.queryByTestId("queued-chip")).not.toBeInTheDocument());
  });

  test("interrupt button shows while Working and calls interruptSession", async () => {
    const calls: string[] = [];
    mockIPC((cmd) => {
      calls.push(cmd);
      return null;
    });
    ingestMeta(meta("Working"));
    render(<Composer sid={TEST_SID} />);
    await userEvent.click(screen.getByTestId("composer-interrupt"));
    expect(calls).toContain("interrupt_session");
  });

  test("'/' opens slash hints from list_slash_commands; Tab inserts", async () => {
    mockIPC((cmd) => {
      if (cmd === "list_slash_commands") {
        return [
          { name: "review", description: "review a PR" },
          { name: "deep-research", description: null },
        ];
      }
      return null;
    });
    ingestMeta(meta("WaitingForInput"));
    render(<Composer sid={TEST_SID} />);
    const input = screen.getByTestId("composer-input");
    fireEvent.change(input, { target: { value: "/rev" } });
    await screen.findByTestId("slash-popover");
    expect(screen.getByTestId("slash-option-review")).toBeInTheDocument();
    expect(screen.queryByTestId("slash-option-deep-research")).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Tab" });
    expect((input as HTMLTextAreaElement).value).toBe("/review ");
    expect(screen.queryByTestId("slash-popover")).not.toBeInTheDocument();
  });
});

describe("SpawnFromChat (haiku default, D-M2-7)", () => {
  test("spawns with haiku by default and reports the new session id", async () => {
    const specs: Array<Record<string, unknown>> = [];
    mockIPC((cmd, args) => {
      if (cmd === "list_agents" || cmd === "list_projects") return [];
      if (cmd === "spawn_session") {
        specs.push((args as { spec: Record<string, unknown> }).spec);
        return { provider: "claude-code", id: "new-session-1" };
      }
      return null;
    });
    const onSpawned = vi.fn();
    render(<SpawnFromChat onSpawned={onSpawned} />);
    expect(screen.getByTestId("model-hint")).toHaveTextContent("thrifty");
    fireEvent.change(screen.getByTestId("spawn-project-path"), { target: { value: "/work/x" } });
    await userEvent.click(screen.getByTestId("spawn-submit"));
    await waitFor(() =>
      expect(onSpawned).toHaveBeenCalledWith({ provider: "claude-code", id: "new-session-1" }),
    );
    expect(specs[0]?.model).toBe("haiku");
    expect(specs[0]?.project_path).toBe("/work/x");
  });

  test("refuses to spawn without a project", async () => {
    mockIPC((cmd) => (cmd === "list_agents" || cmd === "list_projects" ? [] : null));
    render(<SpawnFromChat onSpawned={vi.fn()} />);
    await userEvent.click(screen.getByTestId("spawn-submit"));
    expect(screen.getByTestId("spawn-error")).toHaveTextContent("pick a project");
  });
});

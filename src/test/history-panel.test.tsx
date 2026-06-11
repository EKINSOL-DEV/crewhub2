import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { dayLabel, groupArchived, projectName } from "@/panels/history/group";
import { HistoryPanel } from "@/panels/history/HistoryPanel";
import { HandoffMenu } from "@/panels/sessions/HandoffMenu";
import { OPEN_CHAT_EVENT, type OpenChatRequest } from "@/panels/sessions/openChat";
import { archived, sid } from "./fixtures";

afterEach(() => {
  cleanup();
  clearMocks();
});

const NOW = Date.now();

describe("group helpers", () => {
  test("dayLabel: Today / Yesterday / date", () => {
    expect(dayLabel(NOW, NOW)).toBe("Today");
    expect(dayLabel(NOW - 86_400_000, NOW)).toBe("Yesterday");
    expect(dayLabel(NOW - 10 * 86_400_000, NOW)).toBe(new Date(NOW - 10 * 86_400_000).toLocaleDateString());
  });

  test("groupArchived sorts newest-first and buckets by day", () => {
    const groups = groupArchived(
      [
        archived({ id: sid("old"), last_modified_ms: NOW - 10 * 86_400_000 }),
        archived({ id: sid("new"), last_modified_ms: NOW }),
        archived({ id: sid("new2"), last_modified_ms: NOW - 1000 }),
      ],
      NOW,
    );
    expect(groups[0]?.label).toBe("Today");
    expect(groups[0]?.sessions.map((s) => s.id.id)).toEqual(["new", "new2"]);
    expect(groups[1]?.sessions[0]?.id.id).toBe("old");
  });

  test("projectName takes the basename", () => {
    expect(projectName("/work/proj")).toBe("proj");
    expect(projectName("/")).toBe("/");
  });
});

test("empty state shows when no archives exist (EKI-78)", async () => {
  mockIPC((cmd) => (cmd === "list_archived_sessions" ? [] : null));
  render(<HistoryPanel />);
  await screen.findByText("No past lives yet");
});

test("archived sessions list grouped, click opens chat in history mode", async () => {
  const listed: Array<string | null> = [];
  mockIPC((cmd, args) => {
    if (cmd === "list_archived_sessions") {
      listed.push((args as { projectPath: string | null }).projectPath);
      return [archived({ id: sid("arch-1"), summary: "fixed the flux capacitor", last_modified_ms: NOW })];
    }
    return null;
  });
  const opened: OpenChatRequest[] = [];
  const listener = (e: Event) => opened.push((e as CustomEvent<OpenChatRequest>).detail);
  window.addEventListener(OPEN_CHAT_EVENT, listener);
  try {
    render(<HistoryPanel params={{ projectFilter: "/work/proj" }} />);
    fireEvent.click(await screen.findByText("fixed the flux capacitor"));
    expect(opened[0]).toMatchObject({ id: "arch-1", mode: "history" });
    expect(listed).toEqual(["/work/proj"]); // T1 filter forwarded
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("proj")).toBeInTheDocument();
  } finally {
    window.removeEventListener(OPEN_CHAT_EVENT, listener);
  }
});

test("search shows snippet hits and opens history mode", async () => {
  mockIPC((cmd, args) => {
    if (cmd === "list_archived_sessions") return [];
    if (cmd === "search_transcripts") {
      expect((args as { query: string }).query).toBe("capacitor");
      return [
        { session_id: sid("arch-9"), ts: NOW, role: "assistant", snippet: "…the flux capacitor hums…" },
      ];
    }
    return null;
  });
  const opened: OpenChatRequest[] = [];
  const listener = (e: Event) => opened.push((e as CustomEvent<OpenChatRequest>).detail);
  window.addEventListener(OPEN_CHAT_EVENT, listener);
  try {
    render(<HistoryPanel />);
    const input = await screen.findByLabelText("Search transcripts");
    fireEvent.change(input, { target: { value: "capacitor" } });
    fireEvent.keyDown(input, { key: "Enter" }); // bypass debounce
    const hit = await screen.findByText("…the flux capacitor hums…");
    fireEvent.click(hit);
    expect(opened[0]).toMatchObject({ id: "arch-9", mode: "history" });
  } finally {
    window.removeEventListener(OPEN_CHAT_EVENT, listener);
  }
});

describe("handoff menu (EKI-80)", () => {
  test("lists installed targets, hands off via the Rust command, copies via clipboard plugin", async () => {
    const calls: Array<{ cmd: string; args: unknown }> = [];
    mockIPC((cmd, args) => {
      calls.push({ cmd, args });
      if (cmd === "handoff_targets") return ["Terminal", "Vscode", "RevealInFinder"];
      if (cmd === "handoff") return null;
      return null;
    });
    render(<HandoffMenu projectPath="/work/proj" sessionId="sess-42" />);
    fireEvent.click(screen.getByRole("button", { name: "↗" }));
    await screen.findByTestId("handoff-menu");
    expect(screen.getByText("Open in Terminal")).toBeInTheDocument();
    expect(screen.queryByText("Open in Warp")).toBeNull(); // not installed

    fireEvent.click(screen.getByText("Open in VS Code"));
    await waitFor(() => expect(calls.some((c) => c.cmd === "handoff")).toBe(true));
    expect(calls.find((c) => c.cmd === "handoff")?.args).toMatchObject({
      projectPath: "/work/proj",
      target: "Vscode",
    });
  });

  test("copy path and copy resume command write to the clipboard", async () => {
    const copied: string[] = [];
    mockIPC((cmd, args) => {
      if (cmd === "handoff_targets") return [];
      if (cmd === "plugin:clipboard-manager|write_text") {
        copied.push((args as { text: string }).text);
        return null;
      }
      return null;
    });
    render(<HandoffMenu projectPath="/work/proj" sessionId="sess-42" />);
    fireEvent.click(screen.getByRole("button", { name: "↗" }));
    fireEvent.click(await screen.findByText("Copy path"));
    fireEvent.click(screen.getByText("Copy `claude --resume`"));
    await waitFor(() => expect(copied).toEqual(["/work/proj", "claude --resume sess-42"]));
    await screen.findByText("resume command copied ✓");
  });
});

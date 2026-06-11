import { render, screen, fireEvent, waitFor, cleanup, act, within } from "@testing-library/react";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { formatRelative, formatTokens, formatUsage } from "@/panels/sessions/format";
import { SessionsPanel } from "@/panels/sessions/SessionsPanel";
import { OPEN_CHAT_EVENT, type OpenChatRequest } from "@/panels/sessions/openChat";
import { useAgentsStore } from "@/stores/agents";
import { useBindingsStore } from "@/stores/bindings";
import { useSessionsStore } from "@/stores/sessions";
import { agent, binding, meta, sid } from "./fixtures";

afterEach(() => {
  cleanup();
  clearMocks();
  useAgentsStore.getState().reset();
  useSessionsStore.getState().reset();
  useBindingsStore.getState().reset();
});

describe("format helpers", () => {
  test("formatTokens compacts with one decimal", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(950)).toBe("950");
    expect(formatTokens(12_345)).toBe("12.3k");
    expect(formatTokens(4_100)).toBe("4.1k");
    expect(formatTokens(2_000_000)).toBe("2M");
  });
  test("formatUsage renders the in ▸ out strip", () => {
    expect(formatUsage({ input_tokens: 12_345, output_tokens: 4_100, cache_read_tokens: 0 })).toBe(
      "12.3k ▸ 4.1k",
    );
  });
  test("formatRelative buckets", () => {
    const now = 1_000_000_000;
    expect(formatRelative(now - 1_000, now)).toBe("just now");
    expect(formatRelative(now - 42_000, now)).toBe("42s");
    expect(formatRelative(now - 5 * 60_000, now)).toBe("5m");
    expect(formatRelative(now - 3 * 3_600_000, now)).toBe("3h");
    expect(formatRelative(now - 2 * 86_400_000, now)).toBe("2d");
  });
});

const managed = meta({
  id: sid("aaaa-managed"),
  status: "Working",
  model: "haiku",
  git_branch: "develop",
  usage: { input_tokens: 12_345, output_tokens: 4_100, cache_read_tokens: 0 },
  last_activity_ms: Date.now(),
});
const external = meta({
  id: sid("bbbb-external"),
  origin: "External",
  status: "Idle",
  project_path: "/work/other",
});

function mockWorld(extra?: (cmd: string, args: unknown) => unknown) {
  mockIPC((cmd, args) => {
    const handled = extra?.(cmd, args);
    if (handled !== undefined) return handled;
    if (cmd === "list_all_sessions") return [managed, external];
    if (cmd === "list_session_bindings")
      return [binding({ session_id: "aaaa-managed", agent_id: "ag-1", display_name: "Big refactor" })];
    if (cmd === "list_agents") return [agent({ id: "ag-1", name: "Scout", icon: "🦊" })];
    if (cmd === "list_rooms") return [];
    return null;
  });
}

test("empty state shows the quiet office (EKI-74)", async () => {
  mockIPC((cmd) => {
    if (cmd === "list_all_sessions") return [];
    if (cmd === "list_session_bindings" || cmd === "list_agents" || cmd === "list_rooms") return [];
    return null;
  });
  render(<SessionsPanel />);
  await screen.findByText("The office is quiet");
});

test("lists managed + external with binding names, agent and origin badges", async () => {
  mockWorld();
  render(<SessionsPanel />);
  await screen.findByTestId("session-row-aaaa-managed");
  expect(screen.getByText("Big refactor")).toBeInTheDocument();
  expect(screen.getByText("Managed")).toBeInTheDocument();
  expect(screen.getByText("External")).toBeInTheDocument();
  expect(screen.getByText("🦊 Scout")).toBeInTheDocument();
  expect(screen.getByText("12.3k ▸ 4.1k")).toBeInTheDocument();
  // sessions discovered later pop in live
  act(() => {
    useSessionsStore.getState().apply({
      type: "Discovered",
      data: { meta: meta({ id: sid("cccc-new"), status: "Working" }) },
    });
  });
  expect(screen.getByTestId("session-row-cccc-new")).toBeInTheDocument();
});

test("project filter from panel params scopes the list (EKI-22 hook point)", async () => {
  mockWorld();
  render(<SessionsPanel params={{ projectFilter: "/work/proj" }} />);
  await screen.findByTestId("session-row-aaaa-managed");
  expect(screen.queryByTestId("session-row-bbbb-external")).toBeNull();
});

test("open dispatches the open-chat gesture; kill needs a confirm click", async () => {
  const killed: string[] = [];
  mockWorld((cmd, args) => {
    if (cmd === "kill_session") {
      killed.push((args as { id: { id: string } }).id.id);
      return null;
    }
    return undefined;
  });
  const opened: OpenChatRequest[] = [];
  const listener = (e: Event) => opened.push((e as CustomEvent<OpenChatRequest>).detail);
  window.addEventListener(OPEN_CHAT_EVENT, listener);
  try {
    render(<SessionsPanel />);
    const row = await screen.findByTestId("session-row-aaaa-managed");
    fireEvent.click(within(row).getByRole("button", { name: "Open" }));
    expect(opened[0]).toMatchObject({ id: "aaaa-managed" });

    fireEvent.click(within(row).getByRole("button", { name: "Kill" }));
    expect(killed).toHaveLength(0); // not yet — needs confirm
    fireEvent.click(within(row).getByRole("button", { name: "Sure?" }));
    await waitFor(() => expect(killed).toEqual(["aaaa-managed"]));
  } finally {
    window.removeEventListener(OPEN_CHAT_EVENT, listener);
  }
});

test("bind action opens the binding controls inline", async () => {
  mockWorld();
  render(<SessionsPanel />);
  const row = await screen.findByTestId("session-row-bbbb-external");
  fireEvent.click(within(row).getByRole("button", { name: "Bind" }));
  await screen.findByTestId("binding-controls");
  expect(screen.getByText("Adopt into the crew")).toBeInTheDocument();
});

test("cards toggle renders the card view", async () => {
  mockWorld();
  render(<SessionsPanel />);
  await screen.findByTestId("sessions-table");
  fireEvent.click(screen.getByTestId("view-toggle"));
  await screen.findByTestId("sessions-cards");
  expect(screen.queryByTestId("sessions-table")).toBeNull();
});

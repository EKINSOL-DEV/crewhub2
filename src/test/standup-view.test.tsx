// Coffee Standup tests (Lane G T12, EKI-21 UI): run-now with agent
// multiselect (empty pick = whole crew → null agent_ids), entries streaming
// in through the StandupChanged fold, sticky notes with the cold-coffee
// no-response honesty, history switching, the brewing hint, and the
// "Schedule this" deep-link contract (params only; honest toast while Lane
// H's automation panel isn't merged).
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { scheduleStandup, StandupView } from "@/panels/meetings/StandupView";
import { useAgentsStore } from "@/stores/agents";
import { STANDUP_NO_RESPONSE, useStandupsStore } from "@/stores/meetings";
import { useToasts } from "@/stores/toasts";
import { agent, seedWorkspace } from "./fixtures";
import { standup, standupEntry } from "./meetings-fixtures";

function mockMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
}

beforeEach(() => {
  mockMatchMedia(false);
  seedWorkspace();
});

afterEach(() => {
  cleanup();
  clearMocks();
  vi.unstubAllGlobals();
  useStandupsStore.getState().reset();
  useAgentsStore.getState().reset();
  useToasts.setState({ toasts: [] });
});

const CREW = [agent({ id: "a-1", name: "Botje", icon: "🦾" }), agent({ id: "a-2", name: "Scout" })];

test("run standup: picked agents are passed; the row lands immediately and brews", async () => {
  useAgentsStore.setState({ agents: CREW, loaded: true });
  useStandupsStore.setState({ loaded: true });
  let requested: { agentIds: string[] | null; title: string | null } | null = null;
  mockIPC((cmd, args) => {
    if (cmd === "run_standup") {
      requested = args as { agentIds: string[] | null; title: string | null };
      return standup({ id: "s-1", title: "Daily standup" });
    }
    return null;
  });
  render(<StandupView onError={() => {}} />);

  fireEvent.click(screen.getByTestId("standup-agent-a-1"));
  fireEvent.click(screen.getByTestId("run-standup-now"));
  await waitFor(() => expect(requested).toEqual({ agentIds: ["a-1"], title: "Daily standup" }));

  // the row is in the store right away; no entries yet → brewing hint
  await screen.findByTestId("standup-row-s-1");
  expect(screen.getByTestId("standup-brewing")).toHaveTextContent(/entries stream in/);
});

test("nobody picked = whole crew: agent_ids go up as null", async () => {
  useAgentsStore.setState({ agents: CREW, loaded: true });
  useStandupsStore.setState({ loaded: true });
  let requested: { agentIds: string[] | null } | null = null;
  mockIPC((cmd, args) => {
    if (cmd === "run_standup") {
      requested = args as { agentIds: string[] | null };
      return standup({ id: "s-1" });
    }
    return null;
  });
  render(<StandupView onError={() => {}} />);
  expect(screen.getByText(/nobody picked = the whole crew/)).toBeInTheDocument();
  fireEvent.click(screen.getByTestId("run-standup-now"));
  await waitFor(() => expect(requested).toEqual({ agentIds: null, title: "Daily standup" }));
});

test("entries stream in via the StandupChanged fold; cold coffee for the silent agent", async () => {
  useAgentsStore.setState({ agents: CREW, loaded: true });
  useStandupsStore.setState({
    standups: new Map([["s-1", standup({ id: "s-1" })]]),
    loaded: true,
  });
  let entries = [standupEntry({ id: "e-1", standup_id: "s-1", agent_id: "a-1", blockers: "CI is red" })];
  mockIPC((cmd) => {
    if (cmd === "get_standup") return standup({ id: "s-1" });
    if (cmd === "list_standup_entries") return entries;
    return null;
  });
  render(<StandupView onError={() => {}} />);

  // first StandupChanged: Botje answered
  await act(async () => {
    await useStandupsStore.getState().reconcile("s-1");
  });
  const note1 = await screen.findByTestId("standup-note-e-1");
  expect(note1).toHaveAttribute("data-cold", "false");
  expect(note1).toHaveTextContent("Botje");
  expect(note1).toHaveTextContent("fixed things"); // yesterday
  expect(note1).toHaveTextContent("CI is red"); // blockers

  // second StandupChanged: Scout never answered — honesty row, cold coffee
  entries = [
    ...entries,
    standupEntry({
      id: "e-2",
      standup_id: "s-1",
      agent_id: "a-2",
      yesterday: null,
      today: null,
      blockers: STANDUP_NO_RESPONSE,
    }),
  ];
  await act(async () => {
    await useStandupsStore.getState().reconcile("s-1");
  });
  const note2 = await screen.findByTestId("standup-note-e-2");
  expect(note2).toHaveAttribute("data-cold", "true");
  expect(screen.getByTestId("cold-coffee-e-2")).toHaveTextContent(/🤷 \(no response\)/);
});

test("history: clicking an older standup shows its notes", async () => {
  useAgentsStore.setState({ agents: CREW, loaded: true });
  useStandupsStore.setState({
    standups: new Map([
      ["s-new", standup({ id: "s-new", title: "Today", created_at: 9_000 })],
      ["s-old", standup({ id: "s-old", title: "Yesterday", created_at: 1_000 })],
    ]),
    entries: new Map([
      ["s-new", [standupEntry({ id: "e-n", standup_id: "s-new", agent_id: "a-1", today: "new things" })]],
      ["s-old", [standupEntry({ id: "e-o", standup_id: "s-old", agent_id: "a-1", today: "old things" })]],
    ]),
    loaded: true,
  });
  mockIPC(() => null);
  render(<StandupView onError={() => {}} />);

  // newest selected by default
  expect(screen.getByTestId("standup-row-s-new")).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByTestId("standup-note-e-n")).toHaveTextContent("new things");

  fireEvent.click(screen.getByTestId("standup-row-s-old"));
  expect(screen.getByTestId("standup-note-e-o")).toHaveTextContent("old things");
  expect(screen.queryByTestId("standup-note-e-n")).toBeNull();
});

test("schedule-this deep-links now that the automation panel is registered", () => {
  mockIPC(() => null);
  const ok = scheduleStandup(["a-1"], "Daily standup");
  expect(ok).toBe(true); // PanelKind "automation" exists post-merge
  expect(useToasts.getState().toasts).toHaveLength(0); // no fallback toast
});

test("schedule-this button is wired from the run form", () => {
  useAgentsStore.setState({ agents: CREW, loaded: true });
  useStandupsStore.setState({ loaded: true });
  mockIPC(() => null);
  render(<StandupView onError={() => {}} />);
  fireEvent.click(screen.getByTestId("standup-agent-a-2"));
  fireEvent.click(screen.getByTestId("schedule-standup"));
  // post-merge: deep-links to the automation panel, no fallback toast
  expect(useToasts.getState().toasts).toHaveLength(0);
});

test("☕ empty state when no standup ever ran", () => {
  useAgentsStore.setState({ agents: CREW, loaded: true });
  useStandupsStore.setState({ loaded: true });
  mockIPC(() => null);
  render(<StandupView onError={() => {}} />);
  expect(screen.getByText(/the crew sleeps in/)).toBeInTheDocument();
});

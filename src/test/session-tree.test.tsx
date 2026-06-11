// T16 (EKI-54): the subagent & team tree UI — synthetic metas regardless of
// spike outcome (the component AC), 👥 team badges, indentation, click-through
// to chat, the 🌱 Quiet Orchestra line, and the chat-header subagent strip.
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { resetProjectsForTests } from "@/app/project-filter";
import { MetaStrip } from "@/panels/chat/MetaStrip";
import { humanizeId } from "@/panels/chat/humanize";
import { SessionsPanel } from "@/panels/sessions/SessionsPanel";
import { SessionTree, SubagentStrip } from "@/panels/sessions/SessionTree";
import { useAgentsStore } from "@/stores/agents";
import { useBindingsStore } from "@/stores/bindings";
import { useSessionsStore } from "@/stores/sessions";
import { useTranscripts } from "@/stores/transcripts";
import { resetWorkspaceForTests } from "@/stores/workspace";
import { binding, chatLeaves, meta, seedWorkspace, sid } from "./fixtures";

function ingest(...metas: Parameters<typeof meta>[0][]) {
  for (const m of metas) {
    useSessionsStore.getState().apply({ type: "Updated", data: { meta: meta(m) } });
  }
}

beforeEach(seedWorkspace);
afterEach(() => {
  cleanup();
  clearMocks();
  useSessionsStore.getState().reset();
  useBindingsStore.getState().reset();
  useAgentsStore.getState().reset();
  useTranscripts.setState({ sessions: {} });
  resetProjectsForTests();
  resetWorkspaceForTests();
});

test("renders parent → subagent indentation with humanized names and status dots", () => {
  ingest(
    { id: sid("parent-1"), status: "Working", last_activity_ms: 100 },
    { id: sid("sub-1"), parent: sid("parent-1"), status: "Idle", last_activity_ms: 90 },
  );
  render(<SessionTree projectFilter={null} />);
  const parent = screen.getByTestId("tree-node-parent-1");
  const sub = within(parent).getByTestId("tree-node-sub-1"); // nested inside
  expect(within(sub).getByText("subagent")).toBeInTheDocument();
  // humanized names, never bare uuids (v1 lesson)
  expect(within(sub).getByText(humanizeId("sub-1"))).toBeInTheDocument();
});

test("bound display names win over humanized ids", () => {
  ingest({ id: sid("named-1") });
  useBindingsStore.setState({
    bindings: { "named-1": binding({ session_id: "named-1", display_name: "Big refactor" }) },
  });
  render(<SessionTree projectFilter={null} />);
  expect(screen.getByText("Big refactor")).toBeInTheDocument();
});

test("clicking a node opens its transcript — read-only history for sidechains", () => {
  ingest({ id: sid("parent-1"), last_activity_ms: 100 }, { id: sid("sub-1"), parent: sid("parent-1") });
  render(<SessionTree projectFilter={null} />);
  fireEvent.click(screen.getByTestId("tree-open-sub-1"));
  expect(chatLeaves()[0]?.params).toMatchObject({ sessionId: "claude-code:sub-1", mode: "history" });

  fireEvent.click(screen.getByTestId("tree-open-parent-1"));
  const leaf = chatLeaves().find((l) => l.params?.sessionId === "claude-code:parent-1");
  expect(leaf?.params?.mode).toBeUndefined(); // roots open live
});

test("👥 team badges + bracketed team group render from synthetic metas (spike-independent AC)", () => {
  ingest(
    { id: sid("lead-1"), team: { team_id: "research-crew", role: "lead" }, last_activity_ms: 99 },
    { id: sid("mate-1"), team: { team_id: "research-crew", role: "scout" }, last_activity_ms: 90 },
    { id: sid("solo-1"), last_activity_ms: 50 },
  );
  render(<SessionTree projectFilter={null} />);
  const group = screen.getByTestId("team-group-research-crew");
  expect(within(group).getByText("👥 research-crew")).toBeInTheDocument();
  expect(within(group).getByTestId("tree-node-lead-1")).toBeInTheDocument();
  expect(within(group).getByTestId("tree-node-mate-1")).toBeInTheDocument();
  expect(within(group).getByTestId("team-badge-lead-1").textContent).toContain("lead");
  // the solo session stays outside the bracket — team is additive, null-safe
  expect(within(screen.getByTestId("session-tree")).getByTestId("tree-node-solo-1")).toBeInTheDocument();
});

test("collapse hides children; 🌱 Quiet Orchestra line on an expanded childless root", () => {
  ingest(
    { id: sid("parent-1"), last_activity_ms: 100 },
    { id: sid("sub-1"), parent: sid("parent-1") },
    { id: sid("loner-1"), last_activity_ms: 5 },
  );
  render(<SessionTree projectFilter={null} />);
  expect(screen.getByTestId("tree-node-sub-1")).toBeInTheDocument();
  fireEvent.click(screen.getByTestId("tree-toggle-parent-1"));
  expect(screen.queryByTestId("tree-node-sub-1")).toBeNull();
  // the childless root says so, playfully
  expect(screen.getByTestId("tree-no-subagents").textContent).toContain(
    "no subagents spawned in this session",
  );
});

test("sessions panel: view toggle cycles table → cards → tree", async () => {
  mockIPC((cmd) => {
    if (cmd === "list_all_sessions") return [meta({ id: sid("parent-1") })];
    if (cmd === "list_session_bindings" || cmd === "list_agents" || cmd === "list_rooms") return [];
    return null;
  });
  render(<SessionsPanel />);
  await screen.findByTestId("sessions-table");
  fireEvent.click(screen.getByTestId("view-toggle")); // → cards
  await screen.findByTestId("sessions-cards");
  fireEvent.click(screen.getByTestId("view-toggle")); // → tree
  await screen.findByTestId("session-tree");
  expect(screen.getByTestId("tree-node-parent-1")).toBeInTheDocument();
  fireEvent.click(screen.getByTestId("view-toggle")); // → back to table
  await screen.findByTestId("sessions-table");
});

test("chat header subagent strip: children as chips, click opens read-only; absent when childless", () => {
  ingest(
    { id: sid("parent-1"), status: "Working" },
    { id: sid("sub-1"), parent: sid("parent-1"), status: "Working" },
  );
  render(<MetaStrip sid={sid("parent-1")} />);
  const strip = screen.getByTestId("subagent-strip");
  fireEvent.click(within(strip).getByTestId("subagent-chip-sub-1"));
  expect(chatLeaves()[0]?.params).toMatchObject({ sessionId: "claude-code:sub-1", mode: "history" });

  cleanup();
  seedWorkspace();
  render(<SubagentStrip parentKey="claude-code:sub-1" />);
  expect(screen.queryByTestId("subagent-strip")).toBeNull(); // no children, no noise
});

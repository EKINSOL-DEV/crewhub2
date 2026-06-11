import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { BindingControls } from "@/panels/sessions/BindingControls";
import { useAgentsStore } from "@/stores/agents";
import { useBindingsStore } from "@/stores/bindings";
import { joinSessionsView, sessionKey } from "@/stores/sessions";
import { agent, binding, meta, room, sid } from "./fixtures";

afterEach(() => {
  cleanup();
  clearMocks();
  useAgentsStore.getState().reset();
  useBindingsStore.getState().reset();
});

const scout = agent({ id: "ag-1", name: "Scout" });
const lab = room({ id: "rm-1", name: "Lab" });

function viewFor(bound: boolean) {
  const m = meta({ id: sid("s-1") });
  return joinSessionsView(
    { [sessionKey(m.id)]: m },
    bound ? { "s-1": binding({ session_id: "s-1", agent_id: "ag-1", pinned: false }) } : {},
    [scout],
    [lab],
  )[0]!;
}

test("binding an agent upserts the full desired state (adopt gesture for unbound)", async () => {
  const calls: Array<{ cmd: string; args: unknown }> = [];
  mockIPC((cmd, args) => {
    calls.push({ cmd, args });
    if (cmd === "upsert_session_binding") return binding({ session_id: "s-1", agent_id: "ag-1" });
    return null;
  });
  useAgentsStore.setState({ agents: [scout] });
  useBindingsStore.setState({ rooms: [lab] });
  render(<BindingControls view={viewFor(false)} />);
  expect(screen.getByText("Adopt into the crew")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Bound agent"), { target: { value: "ag-1" } });
  await waitFor(() => expect(calls.some((c) => c.cmd === "upsert_session_binding")).toBe(true));
  const args = calls.find((c) => c.cmd === "upsert_session_binding")?.args as {
    input: { session_id: string; agent_id: string; pinned: boolean };
  };
  expect(args.input).toMatchObject({ session_id: "s-1", agent_id: "ag-1", pinned: false });
});

test("display name commits on Enter; pin toggles; room assigns", async () => {
  const inputs: Array<{ display_name: string | null; pinned: boolean; room_id: string | null }> = [];
  mockIPC((cmd, args) => {
    if (cmd === "upsert_session_binding") {
      const input = (args as { input: (typeof inputs)[number] & { session_id: string } }).input;
      inputs.push(input);
      return binding(input);
    }
    return null;
  });
  useAgentsStore.setState({ agents: [scout] });
  useBindingsStore.setState({ rooms: [lab] });
  render(<BindingControls view={viewFor(true)} />);

  const nameInput = screen.getByLabelText("Display name");
  fireEvent.change(nameInput, { target: { value: "Refactor run" } });
  fireEvent.keyDown(nameInput, { key: "Enter" });
  fireEvent.click(screen.getByLabelText("Pinned"));
  fireEvent.change(screen.getByLabelText("Assigned room"), { target: { value: "rm-1" } });

  await waitFor(() => expect(inputs).toHaveLength(3));
  expect(inputs[0]?.display_name).toBe("Refactor run");
  expect(inputs[1]?.pinned).toBe(true);
  expect(inputs[2]?.room_id).toBe("rm-1");
});

test("failed upsert rolls the store back and surfaces the error (EKI-40 AC)", async () => {
  mockIPC((cmd) => {
    if (cmd === "upsert_session_binding") throw "db locked";
    return null;
  });
  const bound = binding({ session_id: "s-1", agent_id: "ag-1" });
  useAgentsStore.setState({ agents: [scout] });
  useBindingsStore.setState({ bindings: { "s-1": bound }, rooms: [lab] });
  render(<BindingControls view={viewFor(true)} />);
  fireEvent.click(screen.getByLabelText("Pinned"));
  await screen.findByTestId("binding-error");
  expect(useBindingsStore.getState().bindings["s-1"]).toEqual(bound); // rolled back
});

test("unbind removes the binding", async () => {
  let deleted: string | null = null;
  mockIPC((cmd, args) => {
    if (cmd === "delete_session_binding") {
      deleted = (args as { sessionId: string }).sessionId;
      return true;
    }
    return null;
  });
  useAgentsStore.setState({ agents: [scout] });
  useBindingsStore.setState({
    bindings: { "s-1": binding({ session_id: "s-1", agent_id: "ag-1" }) },
    rooms: [],
  });
  render(<BindingControls view={viewFor(true)} />);
  fireEvent.click(screen.getByRole("button", { name: "Unbind" }));
  await waitFor(() => expect(deleted).toBe("s-1"));
  expect(useBindingsStore.getState().bindings["s-1"]).toBeUndefined();
});

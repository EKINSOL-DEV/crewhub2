// M6 T11 (EKI-92, D-M6-4): the EngineEvent → attention-trigger fold (pure,
// table-driven per §3.4), per-rule sink routing against a mocked OS sink,
// dedupe across sinks, per-rule mute, scope context, meeting_complete via
// MeetingChanged, and the G11 focus-listener route to the waiting session.
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { leaves } from "@/app/layout-tree";
import { ToastCenter } from "@/components/ToastCenter";
import type { NotificationRule, SessionEvent } from "@/ipc/bindings";
import { useSessionsStore } from "@/stores/sessions";
import {
  ATTENTION_TRIGGERS,
  combineSinks,
  defaultSink,
  foldEngineEvent,
  matchAttentionRules,
  meetingCompleteNotification,
  ruleSink,
  useToasts,
  waitingSessionKey,
  type AttentionNotification,
  type PrevMeta,
} from "@/stores/toasts";
import { useWorkspace } from "@/stores/workspace";
import { meta, notificationRule, seedWorkspace, sid } from "./fixtures";

vi.mock("@/stores/os-notification", () => ({ sendOsNotification: vi.fn(() => Promise.resolve()) }));
import { sendOsNotification } from "@/stores/os-notification";

const osSink = vi.mocked(sendOsNotification);

afterEach(() => {
  cleanup();
  clearMocks();
  vi.clearAllMocks();
  useToasts.getState().reset();
  useSessionsStore.getState().reset();
});

const WORKING: PrevMeta = { status: "Working", detail: "Editing src/foo.rs" };

function attn(overrides: Partial<AttentionNotification> = {}): AttentionNotification {
  return {
    trigger: "permission_needed",
    key: "claude-code:s1:permission_needed:r1",
    emoji: "✋",
    text: "Scout is waiting on you",
    sessionKey: "claude-code:s1",
    ...overrides,
  };
}

// ── foldEngineEvent (pure, table-driven) ─────────────────────────────────────

test("PermissionRequest folds to permission_needed with the session route", () => {
  const ev: SessionEvent = {
    type: "PermissionRequest",
    data: {
      id: sid("s1"),
      request: { request_id: "r1", tool: "Bash", input_json: "{}", suggestions: [] },
    },
  };
  const n = foldEngineEvent(undefined, ev, "Scout")!;
  expect(n).toMatchObject({
    trigger: "permission_needed",
    sessionKey: "claude-code:s1",
  });
  expect(n.text).toContain("Scout");
  expect(n.text).toContain("Bash");
});

test("Signal{notification} folds to hook_notification (message from payload, tolerant)", () => {
  const make = (payload: string | null): SessionEvent => ({
    type: "Signal",
    data: {
      id: sid("s1"),
      signal: { event: "notification", tool: null, path: null, payload_json: payload, ts: 7 },
    },
  });
  expect(foldEngineEvent(undefined, make('{"message":"Build finished"}'), "Scout")!.text).toBe(
    "Scout: Build finished",
  );
  expect(foldEngineEvent(undefined, make("{malformed"), "Scout")!.text).toBe("Scout sent a notification");
  // other hook events never raise the trigger
  const stop: SessionEvent = {
    type: "Signal",
    data: { id: sid("s1"), signal: { event: "stop", tool: null, path: null, payload_json: null, ts: 1 } },
  };
  expect(foldEngineEvent(undefined, stop, "Scout")).toBeNull();
});

test.each([
  ["Working", true],
  ["WaitingForInput", true],
  ["WaitingForPermission", true],
  ["Idle", false],
  ["Ended", false],
])("Updated → Ended from %s raises session_stopped: %s", (prevStatus, fires) => {
  const ev: SessionEvent = {
    type: "Updated",
    data: { meta: meta({ id: sid("s1"), status: "Ended" }) },
  };
  const n = foldEngineEvent({ status: prevStatus as PrevMeta["status"], detail: null }, ev, "Scout");
  if (fires) expect(n).toMatchObject({ trigger: "session_stopped" });
  else expect(n).toBeNull();
});

test("an Ended transition with an error-ish detail becomes session_error", () => {
  const ev: SessionEvent = {
    type: "Updated",
    data: { meta: meta({ id: sid("s1"), status: "Ended", activity_detail: "Provider error: exit 1" }) },
  };
  expect(foldEngineEvent(WORKING, ev, "Scout")).toMatchObject({ trigger: "session_error" });
  // prev detail counts too
  const quietEnd: SessionEvent = {
    type: "Updated",
    data: { meta: meta({ id: sid("s1"), status: "Ended" }) },
  };
  expect(
    foldEngineEvent({ status: "Working", detail: "error: tool crashed" }, quietEnd, "Scout"),
  ).toMatchObject({ trigger: "session_error" });
});

test("unknown sessions ending (no prev meta) stay silent — discovery is not a stop", () => {
  const ev: SessionEvent = { type: "Updated", data: { meta: meta({ id: sid("s1"), status: "Ended" }) } };
  expect(foldEngineEvent(undefined, ev, "Scout")).toBeNull();
});

// ── sink routing (pure) ──────────────────────────────────────────────────────

test("defaultSink: task triggers toast, attention triggers both", () => {
  expect(defaultSink("task_moved")).toBe("toast");
  for (const t of ATTENTION_TRIGGERS) expect(defaultSink(t)).toBe("both");
});

test("ruleSink reads config_json.sink, falls back per trigger on junk", () => {
  expect(
    ruleSink(notificationRule({ id: "r", trigger: "permission_needed", config_json: '{"sink":"os"}' })),
  ).toBe("os");
  expect(ruleSink(notificationRule({ id: "r", trigger: "task_moved", config_json: '{"sink":"both"}' }))).toBe(
    "both",
  );
  expect(ruleSink(notificationRule({ id: "r", trigger: "task_moved", config_json: "{oops" }))).toBe("toast");
  expect(
    ruleSink(notificationRule({ id: "r", trigger: "session_error", config_json: '{"sink":"pigeon"}' })),
  ).toBe("both");
});

test("combineSinks unions over matching rules", () => {
  const toastOnly = notificationRule({
    id: "a",
    trigger: "permission_needed",
    config_json: '{"sink":"toast"}',
  });
  const osOnly = notificationRule({ id: "b", trigger: "permission_needed", config_json: '{"sink":"os"}' });
  expect(combineSinks([toastOnly])).toEqual({ toast: true, os: false });
  expect(combineSinks([toastOnly, osOnly])).toEqual({ toast: true, os: true });
});

// ── matchAttentionRules (scopes + mute) ──────────────────────────────────────

test("attention scopes: global always, agent/project by ctx; mute wins", () => {
  const n = attn();
  const ctx = { agentId: "ag-1", projectId: "p-1" };
  expect(
    matchAttentionRules([notificationRule({ id: "g", trigger: "permission_needed" })], n, ctx),
  ).toHaveLength(1);
  expect(
    matchAttentionRules(
      [notificationRule({ id: "a", trigger: "permission_needed", scope: "agent", scope_id: "ag-1" })],
      n,
      ctx,
    ),
  ).toHaveLength(1);
  expect(
    matchAttentionRules(
      [notificationRule({ id: "a", trigger: "permission_needed", scope: "agent", scope_id: "ag-2" })],
      n,
      ctx,
    ),
  ).toHaveLength(0);
  expect(
    matchAttentionRules(
      [notificationRule({ id: "p", trigger: "permission_needed", scope: "project", scope_id: "p-1" })],
      n,
      ctx,
    ),
  ).toHaveLength(1);
  // per-rule mute (enabled=false) silences it
  expect(
    matchAttentionRules(
      [notificationRule({ id: "g", trigger: "permission_needed", enabled: false })],
      n,
      ctx,
    ),
  ).toHaveLength(0);
});

// ── publishAttention: dispatch, dedupe across sinks, OS sink mocked ──────────

/** Seed rules in the store AND behind list_notification_rules — init()'s
 *  async refresh must land on the same set, not wipe it. */
function seedRules(rules: NotificationRule[], extra?: (cmd: string) => unknown) {
  mockIPC((cmd) => {
    if (cmd === "list_notification_rules") return rules;
    return extra?.(cmd) ?? [];
  });
  useToasts.setState({ rules, loaded: true });
}

test("permission_needed with a both-sink rule raises ONE toast and ONE OS notification", () => {
  seedRules([notificationRule({ id: "r", trigger: "permission_needed", config_json: '{"sink":"both"}' })]);
  render(<ToastCenter />);
  act(() => {
    useToasts.getState().publishAttention(attn());
    useToasts.getState().publishAttention(attn()); // duplicate burst — dedupe across sinks
  });
  expect(screen.getAllByTestId("toast-body")).toHaveLength(1);
  expect(osSink).toHaveBeenCalledTimes(1);
  expect(osSink).toHaveBeenCalledWith("CrewHub", expect.stringContaining("Scout"));
});

test("os-only rules skip the toast; toast-only rules skip the OS sink", () => {
  seedRules([notificationRule({ id: "r", trigger: "permission_needed", config_json: '{"sink":"os"}' })]);
  render(<ToastCenter />);
  act(() => useToasts.getState().publishAttention(attn()));
  expect(screen.queryByTestId("toast-body")).toBeNull();
  expect(osSink).toHaveBeenCalledTimes(1);

  act(() => {
    useToasts.getState().reset();
  });
  seedRules([notificationRule({ id: "r", trigger: "session_stopped", config_json: '{"sink":"toast"}' })]);
  act(() =>
    useToasts
      .getState()
      .publishAttention(attn({ trigger: "session_stopped", key: "k2", text: "Scout stopped" })),
  );
  expect(osSink).toHaveBeenCalledTimes(1); // unchanged
});

test("muted rule (enabled=false) silences BOTH sinks", () => {
  seedRules([
    notificationRule({
      id: "r",
      trigger: "permission_needed",
      enabled: false,
      config_json: '{"sink":"both"}',
    }),
  ]);
  render(<ToastCenter />);
  act(() => useToasts.getState().publishAttention(attn()));
  expect(screen.queryByTestId("toast-body")).toBeNull();
  expect(osSink).not.toHaveBeenCalled();
});

test("attention toast click routes to the chat at the session", () => {
  seedWorkspace();
  seedRules([notificationRule({ id: "r", trigger: "permission_needed", config_json: '{"sink":"toast"}' })]);
  render(<ToastCenter />);
  act(() => useToasts.getState().publishAttention(attn()));
  act(() => screen.getByTestId("toast-body").click());
  const chat = leaves(useWorkspace.getState().tabs[0]!.root).find((l) => l.kind === "chat");
  expect(chat?.params).toMatchObject({ sessionId: "claude-code:s1" });
});

// ── meeting_complete (MeetingChanged fold) ───────────────────────────────────

test("publishMeetingChanged notifies once when the meeting reaches complete", async () => {
  let state = "round";
  seedRules(
    [notificationRule({ id: "r", trigger: "meeting_complete", config_json: '{"sink":"both"}' })],
    (cmd) => {
      if (cmd === "get_meeting")
        return {
          id: "m1",
          title: "Naming things",
          goal: null,
          state,
          room_id: null,
          project_id: null,
          config_json: null,
          output_md: null,
          output_path: null,
          current_round: null,
          current_turn: null,
          started_at: null,
          completed_at: null,
          cancelled_at: null,
          error_message: null,
        };
      return undefined;
    },
  );
  render(<ToastCenter />);
  await act(() => useToasts.getState().publishMeetingChanged("m1")); // still running — silent
  expect(screen.queryByTestId("toast-body")).toBeNull();
  state = "complete";
  await act(() => useToasts.getState().publishMeetingChanged("m1"));
  expect(screen.getByTestId("toast-body")).toHaveTextContent("Naming things");
  expect(osSink).toHaveBeenCalledTimes(1);
  await act(() => useToasts.getState().publishMeetingChanged("m1")); // announced once, ever
  expect(screen.getAllByTestId("toast-body")).toHaveLength(1);
});

test("meetingCompleteNotification copy", () => {
  const n = meetingCompleteNotification("m1", "Sprint review");
  expect(n.trigger).toBe("meeting_complete");
  expect(n.text).toContain("Sprint review");
  expect(n.sessionKey).toBeNull();
});

// ── G11: focus-listener route to the waiting session ─────────────────────────

test("waitingSessionKey picks the newest WaitingForPermission session", () => {
  expect(waitingSessionKey({})).toBeNull();
  const sessions = {
    "claude-code:a": meta({ id: sid("a"), status: "Working", last_activity_ms: 9 }),
    "claude-code:b": meta({ id: sid("b"), status: "WaitingForPermission", last_activity_ms: 5 }),
    "claude-code:c": meta({ id: sid("c"), status: "WaitingForPermission", last_activity_ms: 8 }),
  };
  expect(waitingSessionKey(sessions)).toBe("claude-code:c");
});

test("window focus after a permission OS dispatch opens the waiting chat (armed once)", async () => {
  mockIPC(() => []);
  seedWorkspace();
  render(<ToastCenter />); // init() attaches the focus listener
  await waitFor(() => expect(useToasts.getState().loaded).toBe(true));
  seedRules([notificationRule({ id: "r", trigger: "permission_needed", config_json: '{"sink":"os"}' })]);
  useSessionsStore.setState({
    sessions: { "claude-code:s1": meta({ id: sid("s1"), status: "WaitingForPermission" }) },
  });

  // focus BEFORE any dispatch: not armed, nothing routes
  act(() => void window.dispatchEvent(new Event("focus")));
  expect(leaves(useWorkspace.getState().tabs[0]!.root).find((l) => l.kind === "chat")).toBeUndefined();

  act(() => useToasts.getState().publishAttention(attn()));
  act(() => void window.dispatchEvent(new Event("focus")));
  const chat = leaves(useWorkspace.getState().tabs[0]!.root).find((l) => l.kind === "chat");
  expect(chat?.params).toMatchObject({ sessionId: "claude-code:s1" });
});

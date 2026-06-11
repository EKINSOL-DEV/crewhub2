// Meetings & standups store tests (Lane G T10/T12): pure selectors first —
// the 💤 skipped-turn contract (completed_at NULL + meeting moved past), the
// position cursor, parse-tolerant config — then the two refetch folds against
// mocked IPC (MeetingChanged → get_meeting + turns; StandupChanged → standup +
// entries), and the D-M4-3 model-policy read with cheap defaults.
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import {
  formatDuration,
  isNoResponse,
  isTerminalState,
  meetingDurationMs,
  meetingMatchesFilter,
  meetingPosition,
  meetingStateBadge,
  parseMeetingConfig,
  readModelPolicy,
  resolveTurnSession,
  roundLabel,
  sortMeetings,
  sortStandups,
  standupRunSpecParams,
  STANDUP_NO_RESPONSE,
  turnAt,
  turnChip,
  useMeetingsStore,
  useStandupsStore,
} from "@/stores/meetings";
import { meta, sid } from "./fixtures";
import {
  actionItem,
  meeting,
  meetingConfigJson,
  participant,
  standup,
  standupEntry,
  turn,
} from "./meetings-fixtures";

afterEach(() => {
  clearMocks();
  useMeetingsStore.getState().reset();
  useStandupsStore.getState().reset();
});

// ── parseMeetingConfig (tolerant) ────────────────────────────────────────────

describe("parseMeetingConfig", () => {
  test("round-trips the engine shape", () => {
    const cfg = parseMeetingConfig(meetingConfigJson([participant("a-1", "Botje")], 3));
    expect(cfg.participants).toEqual([{ agent_id: "a-1", name: "Botje", persona: null }]);
    expect(cfg.rounds).toBe(3);
    expect(cfg.participant_model).toBe("haiku");
    expect(cfg.synthesis_model).toBe("sonnet");
  });

  test("null, garbage and wrong-shaped json all fall back to an empty 2-round config", () => {
    for (const bad of [null, "not json {", "[]", '{"participants": "nope", "rounds": -1}']) {
      const cfg = parseMeetingConfig(bad);
      expect(cfg.participants).toEqual([]);
      expect(cfg.rounds).toBe(2);
    }
  });

  test("participants missing required fields are dropped, not crashed on", () => {
    const cfg = parseMeetingConfig(
      JSON.stringify({ participants: [{ agent_id: "a-1" }, { agent_id: "a-2", name: "Ok" }, 7] }),
    );
    expect(cfg.participants).toEqual([{ agent_id: "a-2", name: "Ok", persona: null }]);
  });
});

// ── Position + chips (the Lane 0 💤 contract) ────────────────────────────────

describe("meetingPosition / turnChip", () => {
  const m = (state: string, round: number | null = null, turnIdx: number | null = null) =>
    meeting({ id: "m-1", state, current_round: round, current_turn: turnIdx });

  test("gathering is round 0; synthesis/complete are past everything", () => {
    expect(meetingPosition(m("gathering", 0, 1))).toEqual({ round: 0, turn: 1 });
    expect(meetingPosition(m("round", 2, 0))).toEqual({ round: 2, turn: 0 });
    expect(meetingPosition(m("synthesis", 0, 0)).round).toBe(Number.POSITIVE_INFINITY);
    expect(meetingPosition(m("complete", 0, 0)).round).toBe(Number.POSITIVE_INFINITY);
  });

  test("completed turn is ✅ done regardless of position", () => {
    const t = turn({ id: "t", meeting_id: "m-1", round_num: 0, turn_index: 0, completed_at: 5_000 });
    expect(turnChip(t, m("round", 2, 1))).toBe("done");
  });

  test("💤 skipped = completed_at NULL + the meeting moved past it", () => {
    const t = turn({ id: "t", meeting_id: "m-1", round_num: 0, turn_index: 0, completed_at: null });
    expect(turnChip(t, m("gathering", 0, 1))).toBe("skipped"); // same round, cursor beyond
    expect(turnChip(t, m("round", 1, 0))).toBe("skipped"); // later round
    expect(turnChip(t, m("synthesis"))).toBe("skipped"); // synthesis is past all turns
    expect(turnChip(t, m("complete"))).toBe("skipped");
  });

  test("the turn at the cursor of a live meeting is 🎙️ active; ahead is pending", () => {
    const t0 = turn({ id: "t0", meeting_id: "m-1", round_num: 1, turn_index: 1, completed_at: null });
    expect(turnChip(t0, m("round", 1, 1))).toBe("active");
    const ahead = turn({ id: "t1", meeting_id: "m-1", round_num: 2, turn_index: 0, completed_at: null });
    expect(turnChip(ahead, m("round", 1, 1))).toBe("pending");
  });

  test("cancelled/error freeze the cursor: before = skipped, at/after = pending (never ran)", () => {
    const before = turn({ id: "t0", meeting_id: "m-1", round_num: 0, turn_index: 0, completed_at: null });
    const at = turn({ id: "t1", meeting_id: "m-1", round_num: 1, turn_index: 0, completed_at: null });
    const cancelled = m("cancelled", 1, 0);
    expect(turnChip(before, cancelled)).toBe("skipped");
    expect(turnChip(at, cancelled)).toBe("pending"); // not skipped — the meeting died here
    expect(turnChip(at, m("error", 1, 0))).toBe("pending");
  });

  test("turnAt finds the row for one (round, participant) cell", () => {
    const rows = [
      turn({ id: "t0", meeting_id: "m-1", round_num: 0, turn_index: 0 }),
      turn({ id: "t1", meeting_id: "m-1", round_num: 1, turn_index: 1 }),
    ];
    expect(turnAt(rows, 1, 1)?.id).toBe("t1");
    expect(turnAt(rows, 2, 0)).toBeNull();
  });
});

// ── List helpers ─────────────────────────────────────────────────────────────

describe("list selectors", () => {
  test("sortMeetings floats live meetings, then newest started first", () => {
    const done = meeting({ id: "done", state: "complete", started_at: 9_000, completed_at: 9_500 });
    const old = meeting({ id: "old", state: "complete", started_at: 1_000, completed_at: 2_000 });
    const live = meeting({ id: "live", state: "round", started_at: 500 });
    expect(sortMeetings([old, done, live]).map((m) => m.id)).toEqual(["live", "done", "old"]);
  });

  test("meetingMatchesFilter scopes by room and project", () => {
    const m = meeting({ id: "m", room_id: "r-1", project_id: "p-1" });
    expect(meetingMatchesFilter(m, { roomId: null, projectId: null })).toBe(true);
    expect(meetingMatchesFilter(m, { roomId: "r-1", projectId: "p-1" })).toBe(true);
    expect(meetingMatchesFilter(m, { roomId: "r-2", projectId: null })).toBe(false);
    expect(meetingMatchesFilter(m, { roomId: null, projectId: "p-2" })).toBe(false);
  });

  test("duration: completed/cancelled end the clock, running has none", () => {
    expect(meetingDurationMs(meeting({ id: "m", started_at: 1_000, completed_at: 62_000 }))).toBe(61_000);
    expect(meetingDurationMs(meeting({ id: "m", started_at: 1_000, cancelled_at: 2_000 }))).toBe(1_000);
    expect(meetingDurationMs(meeting({ id: "m", started_at: 1_000 }))).toBeNull();
    expect(formatDuration(61_000)).toBe("1m 1s");
    expect(formatDuration(9_000)).toBe("9s");
  });

  test("state badges cover every engine state and tolerate unknown ones", () => {
    for (const s of ["gathering", "round", "synthesis", "complete", "cancelled", "error"]) {
      expect(meetingStateBadge(s).emoji).not.toBe("❓");
    }
    expect(meetingStateBadge("weird").emoji).toBe("❓");
    expect(isTerminalState("complete")).toBe(true);
    expect(isTerminalState("round")).toBe(false);
    expect(roundLabel(meeting({ id: "m", state: "round", current_round: 2 }), 3)).toBe("🔁 Round 2 of 3");
  });
});

// ── Session resolution (raw id → provider-qualified) ─────────────────────────

describe("resolveTurnSession", () => {
  test("prefers the live meta, falls back to the fleet's provider", () => {
    const metas = [meta({ id: sid("sess-1", "other-provider") })];
    expect(resolveTurnSession("sess-1", metas)).toEqual({ provider: "other-provider", id: "sess-1" });
    expect(resolveTurnSession("gone-2", metas)).toEqual({ provider: "other-provider", id: "gone-2" });
    expect(resolveTurnSession("x", [])).toEqual({ provider: "claude-code", id: "x" });
    expect(resolveTurnSession(null, metas)).toBeNull();
  });
});

// ── Model policy (D-M4-3: data, never hardcoded expensive) ───────────────────

describe("readModelPolicy", () => {
  test("defaults are haiku / sonnet / haiku when settings are empty", async () => {
    mockIPC((cmd) => (cmd === "get_setting" ? null : null));
    const p = await readModelPolicy();
    expect(p).toEqual({ participant: "haiku", synthesis: "sonnet", standup: "haiku" });
  });

  test("settings keys override per policy slot", async () => {
    mockIPC((cmd, args) => {
      if (cmd !== "get_setting") return null;
      const key = (args as { key: string }).key;
      if (key === "model_policy.meeting_synthesis") return "opus";
      if (key === "model_policy.standup") return "sonnet";
      return null;
    });
    const p = await readModelPolicy();
    expect(p).toEqual({ participant: "haiku", synthesis: "opus", standup: "sonnet" });
  });
});

// ── Meetings store fold ──────────────────────────────────────────────────────

describe("meetings store", () => {
  test("reseed seeds from list_meetings; reconcile refetches meeting + turns", async () => {
    const m1 = meeting({ id: "m-1", state: "gathering" });
    let current = m1;
    let turnsServed = 0;
    mockIPC((cmd, args) => {
      if (cmd === "list_meetings") return [m1];
      if (cmd === "get_meeting") return current;
      if (cmd === "list_meeting_turns") {
        turnsServed += 1;
        return [turn({ id: "t-0", meeting_id: "m-1", round_num: 0, turn_index: 0 })];
      }
      void args;
      return null;
    });
    const s = useMeetingsStore.getState();
    await s.reseed();
    expect(useMeetingsStore.getState().meetings.get("m-1")?.state).toBe("gathering");

    current = { ...m1, state: "round", current_round: 1, current_turn: 0 };
    await s.reconcile("m-1");
    const after = useMeetingsStore.getState();
    expect(after.meetings.get("m-1")?.state).toBe("round");
    expect(after.turns.get("m-1")).toHaveLength(1);
    expect(turnsServed).toBe(1);
  });

  test("reconcile of a completed meeting also refetches action items", async () => {
    const done = meeting({ id: "m-1", state: "complete", output_md: "## Summary", completed_at: 2_000 });
    mockIPC((cmd) => {
      if (cmd === "get_meeting") return done;
      if (cmd === "list_meeting_turns") return [];
      if (cmd === "list_action_items")
        return [actionItem({ id: "ai-1", meeting_id: "m-1", text: "ship it" })];
      return null;
    });
    await useMeetingsStore.getState().reconcile("m-1");
    expect(useMeetingsStore.getState().actionItems.get("m-1")?.[0]?.text).toBe("ship it");
  });

  test("get_meeting null drops the meeting and its satellite data", async () => {
    useMeetingsStore.setState({
      meetings: new Map([["m-1", meeting({ id: "m-1" })]]),
      turns: new Map([["m-1", [turn({ id: "t", meeting_id: "m-1", round_num: 0, turn_index: 0 })]]]),
      actionItems: new Map([["m-1", []]]),
    });
    mockIPC((cmd) => (cmd === "get_meeting" ? null : null));
    await useMeetingsStore.getState().reconcile("m-1");
    const s = useMeetingsStore.getState();
    expect(s.meetings.has("m-1")).toBe(false);
    expect(s.turns.has("m-1")).toBe(false);
    expect(s.actionItems.has("m-1")).toBe(false);
  });

  test("start inserts the returned row; cancel updates it; errors surface", async () => {
    const started = meeting({ id: "m-9", state: "gathering" });
    mockIPC((cmd) => {
      if (cmd === "start_meeting") return started;
      if (cmd === "cancel_meeting") return { ...started, state: "cancelled", cancelled_at: 2_000 };
      return null;
    });
    const res = await useMeetingsStore.getState().start({
      title: "T",
      goal: null,
      room_id: null,
      project_id: null,
      project_path: "/work/proj",
      participants: [participant("a-1"), participant("a-2")],
      rounds: 2,
      turn_timeout_ms: null,
      participant_model: "haiku",
      synthesis_model: "sonnet",
      context_docs: null,
    });
    expect(res.status).toBe("ok");
    expect(useMeetingsStore.getState().meetings.get("m-9")?.state).toBe("gathering");

    const err = await useMeetingsStore.getState().cancel("m-9");
    expect(err).toBeNull();
    expect(useMeetingsStore.getState().meetings.get("m-9")?.state).toBe("cancelled");
  });

  test("convertActionItem refetches items so the task_id backfill shows", async () => {
    let converted = false;
    mockIPC((cmd, args) => {
      if (cmd === "convert_action_item") {
        converted = true;
        expect((args as { roomId: string | null }).roomId).toBe("r-1");
        return { id: "task-1", title: "ship it" };
      }
      if (cmd === "list_action_items")
        return [
          actionItem({
            id: "ai-1",
            meeting_id: "m-1",
            task_id: converted ? "task-1" : null,
          }),
        ];
      return null;
    });
    const res = await useMeetingsStore.getState().convertActionItem("ai-1", "m-1", "r-1");
    expect(res.status).toBe("ok");
    expect(useMeetingsStore.getState().actionItems.get("m-1")?.[0]?.task_id).toBe("task-1");
  });
});

// ── Standups fold (the +standups half of this file) ──────────────────────────

describe("standups store", () => {
  test("run returns the row immediately; entries stream in via reconcile", async () => {
    const row = standup({ id: "s-1", title: "Daily" });
    let entries: ReturnType<typeof standupEntry>[] = [];
    mockIPC((cmd) => {
      if (cmd === "run_standup") return row;
      if (cmd === "get_standup") return row;
      if (cmd === "list_standup_entries") return entries;
      return null;
    });

    const res = await useStandupsStore.getState().run(["a-1", "a-2"], "Daily");
    expect(res.status).toBe("ok");
    expect(useStandupsStore.getState().standups.get("s-1")?.title).toBe("Daily");
    expect(useStandupsStore.getState().entries.get("s-1")).toBeUndefined(); // nothing yet

    // first StandupChanged: one entry landed
    entries = [standupEntry({ id: "e-1", standup_id: "s-1", agent_id: "a-1" })];
    await useStandupsStore.getState().reconcile("s-1");
    expect(useStandupsStore.getState().entries.get("s-1")).toHaveLength(1);

    // second: the other agent never answered — honesty row
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
    await useStandupsStore.getState().reconcile("s-1");
    const all = useStandupsStore.getState().entries.get("s-1")!;
    expect(all).toHaveLength(2);
    expect(isNoResponse(all[1]!)).toBe(true);
    expect(isNoResponse(all[0]!)).toBe(false);
  });

  test("reseed seeds and sorts newest first", async () => {
    mockIPC((cmd) =>
      cmd === "list_standups"
        ? [standup({ id: "old", created_at: 1 }), standup({ id: "new", created_at: 9 })]
        : null,
    );
    await useStandupsStore.getState().reseed();
    const sorted = sortStandups([...useStandupsStore.getState().standups.values()]);
    expect(sorted.map((s) => s.id)).toEqual(["new", "old"]);
  });

  test("standupRunSpecParams builds the D-M4-5 standup spec deep-link payload", () => {
    const params = standupRunSpecParams(["a-1"], "Daily");
    expect(params.create).toBe("1");
    expect(JSON.parse(params.spec!)).toEqual({ action: "standup", agent_ids: ["a-1"], title: "Daily" });
    // empty selection = "all non-archived agents" — agent_ids omitted entirely
    expect(JSON.parse(standupRunSpecParams([], "All hands").spec!)).toEqual({
      action: "standup",
      title: "All hands",
    });
  });
});

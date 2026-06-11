// T12 (EKI-49): the seq stitch buffer — live events and history pages merge
// into one ordered list with zero dedup logic (D-M2-3).
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import type { SeqItem, SessionId, TranscriptItem, TranscriptPage } from "@/ipc/bindings";
import {
  emptyTranscript,
  insertSorted,
  parseSessionKey,
  sessionKey,
  useTranscripts,
  PAGE_SIZE,
} from "@/stores/transcripts";

const SID: SessionId = { provider: "claude-code", id: "s1" };
const KEY = sessionKey(SID);

function text(n: number): TranscriptItem {
  return { kind: "UserText", data: { text: `msg ${n}`, ts: n } };
}
function seqItems(...seqs: number[]): SeqItem[] {
  return seqs.map((seq) => ({ seq, item: text(seq) }));
}
function page(total: number, ...seqs: number[]): TranscriptPage {
  return { items: seqItems(...seqs), total };
}
function orderOf(): number[] {
  return useTranscripts.getState().sessions[KEY]?.order ?? [];
}

beforeEach(() => {
  useTranscripts.setState({ sessions: {} });
});
afterEach(clearMocks);

describe("helpers", () => {
  test("sessionKey round-trips through parseSessionKey", () => {
    expect(parseSessionKey(KEY)).toEqual(SID);
  });

  test("insertSorted appends, inserts mid, and is idempotent", () => {
    let o: number[] = [];
    o = insertSorted(o, 5);
    o = insertSorted(o, 7);
    o = insertSorted(o, 6);
    o = insertSorted(o, 0);
    expect(o).toEqual([0, 5, 6, 7]);
    expect(insertSorted(o, 6)).toEqual([0, 5, 6, 7]);
  });
});

describe("stitching", () => {
  test("live-then-page converges to one ordered list", () => {
    const s = useTranscripts.getState();
    s.ingestLive(SID, 10, text(10));
    s.ingestLive(SID, 11, text(11));
    s.ingestPage(SID, page(12, 8, 9, 10));
    expect(orderOf()).toEqual([8, 9, 10, 11]);
    expect(useTranscripts.getState().sessions[KEY]?.total).toBe(12);
  });

  test("page-then-live appends seamlessly", () => {
    const s = useTranscripts.getState();
    s.ingestPage(SID, page(3, 0, 1, 2));
    s.ingestLive(SID, 3, text(3));
    expect(orderOf()).toEqual([0, 1, 2, 3]);
    expect(useTranscripts.getState().sessions[KEY]?.total).toBe(4);
  });

  test("gap fill: older page lands under live items", () => {
    const s = useTranscripts.getState();
    s.ingestLive(SID, 200, text(200));
    s.ingestPage(SID, page(201, 198, 199));
    expect(orderOf()).toEqual([198, 199, 200]);
  });

  test("out-of-order pages converge to one identical list", () => {
    const a = useTranscripts.getState();
    a.ingestPage(SID, page(6, 4, 5));
    a.ingestPage(SID, page(6, 0, 1));
    a.ingestPage(SID, page(6, 2, 3));

    useTranscripts.setState({ sessions: {} });
    const b = useTranscripts.getState();
    b.ingestPage(SID, page(6, 0, 1));
    b.ingestPage(SID, page(6, 2, 3));
    b.ingestPage(SID, page(6, 4, 5));
    expect(orderOf()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test("duplicate seqs are idempotent (live + page overlap)", () => {
    const s = useTranscripts.getState();
    s.ingestLive(SID, 1, text(1));
    s.ingestPage(SID, page(2, 0, 1));
    s.ingestLive(SID, 1, text(1));
    expect(orderOf()).toEqual([0, 1]);
    expect(useTranscripts.getState().sessions[KEY]?.items.size).toBe(2);
  });

  test("Removed event resets the buffer (truncation contract, M2-R2)", () => {
    const s = useTranscripts.getState();
    s.ingestLive(SID, 0, text(0));
    s.ingestEngineEvent({ type: "Removed", data: { id: SID } });
    expect(useTranscripts.getState().sessions[KEY]).toBeUndefined();
  });
});

describe("paging IPC", () => {
  test("openSession probes total then fetches the newest page", async () => {
    const calls: Array<{ offset: number; limit: number }> = [];
    mockIPC((cmd, args) => {
      if (cmd !== "get_session_transcript") return null;
      const { offset, limit } = args as { offset: number; limit: number };
      calls.push({ offset, limit });
      if (limit === 0) return { items: [], total: 450 };
      return { items: seqItems(offset, offset + 1), total: 450 };
    });
    await useTranscripts.getState().openSession(SID);
    expect(calls).toEqual([
      { offset: 0, limit: 0 },
      { offset: 450 - PAGE_SIZE, limit: PAGE_SIZE },
    ]);
    expect(useTranscripts.getState().sessions[KEY]?.opened).toBe(true);
    expect(orderOf()).toEqual([250, 251]);
  });

  test("openSession on a session with no transcript marks opened, stays empty", async () => {
    mockIPC(() => {
      throw new Error("no transcript found");
    });
    await useTranscripts.getState().openSession(SID);
    const t = useTranscripts.getState().sessions[KEY];
    expect(t?.opened).toBe(true);
    expect(t?.order).toEqual([]);
  });

  test("loadOlder pages the gap below the lowest loaded seq", async () => {
    const calls: Array<{ offset: number; limit: number }> = [];
    mockIPC((cmd, args) => {
      if (cmd !== "get_session_transcript") return null;
      const { offset, limit } = args as { offset: number; limit: number };
      calls.push({ offset, limit });
      return { items: seqItems(offset, offset + limit - 1), total: 500 };
    });
    useTranscripts.getState().ingestPage(SID, page(500, 300, 301));
    await useTranscripts.getState().loadOlder(SID);
    expect(calls).toEqual([{ offset: 300 - PAGE_SIZE, limit: PAGE_SIZE }]);
    expect(orderOf()).toEqual([100, 299, 300, 301]);
    expect(useTranscripts.getState().sessions[KEY]?.loadingOlder).toBe(false);
  });

  test("loadOlder is a no-op at the top and while already loading", async () => {
    const calls: string[] = [];
    mockIPC((cmd) => {
      calls.push(cmd);
      return { items: [], total: 2 };
    });
    useTranscripts.getState().ingestPage(SID, page(2, 0, 1));
    await useTranscripts.getState().loadOlder(SID); // lowest === 0
    expect(calls).toEqual([]);
  });
});

describe("ensureSeq (seq-anchor, SEAM 2)", () => {
  test("pages older until the page containing the target seq is loaded", async () => {
    const calls: Array<{ offset: number; limit: number }> = [];
    mockIPC((cmd, args) => {
      if (cmd !== "get_session_transcript") return null;
      const { offset, limit } = args as { offset: number; limit: number };
      calls.push({ offset, limit });
      return { items: seqItems(offset, offset + limit - 1), total: 500 };
    });
    useTranscripts.getState().ingestPage(SID, page(500, 400, 401));
    await useTranscripts.getState().ensureSeq(SID, 150);
    // 400 → [200,400) → lowest 200 → [0,200) → lowest 0 ≤ 150, done.
    expect(calls).toEqual([
      { offset: 400 - PAGE_SIZE, limit: PAGE_SIZE },
      { offset: 0, limit: PAGE_SIZE },
    ]);
    expect(orderOf()[0]).toBeLessThanOrEqual(150);
  });

  test("no-op when the seq is already at or above the lowest loaded seq", async () => {
    const calls: string[] = [];
    mockIPC((cmd) => {
      calls.push(cmd);
      return { items: [], total: 5 };
    });
    useTranscripts.getState().ingestPage(SID, page(5, 1, 2, 3));
    await useTranscripts.getState().ensureSeq(SID, 2);
    expect(calls).toEqual([]);
  });

  test("bails out when paging makes no progress (no infinite loop)", async () => {
    const calls: string[] = [];
    mockIPC((cmd) => {
      calls.push(cmd);
      return { items: [], total: 500 }; // empty page: lowest never moves
    });
    useTranscripts.getState().ingestPage(SID, page(500, 400)); // opened, lowest 400
    await useTranscripts.getState().ensureSeq(SID, 10);
    expect(calls).toHaveLength(1);
  });

  test("opens the session first when nothing is loaded yet", async () => {
    const calls: Array<{ offset: number; limit: number }> = [];
    mockIPC((cmd, args) => {
      if (cmd !== "get_session_transcript") return null;
      const { offset, limit } = args as { offset: number; limit: number };
      calls.push({ offset, limit });
      if (limit === 0) return { items: [], total: 10 };
      return { items: seqItems(offset, offset + 1), total: 10 };
    });
    await useTranscripts.getState().ensureSeq(SID, 5);
    expect(calls[0]).toEqual({ offset: 0, limit: 0 }); // openSession probe
    expect(useTranscripts.getState().sessions[KEY]?.opened).toBe(true);
  });
});

describe("pending prompts (consumed by T15)", () => {
  test("permission/question events attach; resolving leaves a receipt", () => {
    const s = useTranscripts.getState();
    s.ingestEngineEvent({
      type: "PermissionRequest",
      data: { id: SID, request: { request_id: "r1", tool: "Edit", input_json: "{}", suggestions: [] } },
    });
    s.ingestEngineEvent({
      type: "Question",
      data: {
        id: SID,
        question: { request_id: "q1", kind: "question", text: "Pick", options: ["a"], multi_select: false },
      },
    });
    let t = useTranscripts.getState().sessions[KEY];
    expect(t?.pendingPermissions.map((p) => p.request_id)).toEqual(["r1"]);
    expect(t?.pendingQuestions.map((q) => q.request_id)).toEqual(["q1"]);

    s.resolvePrompt(SID, "r1", "✅ allowed Edit on src/foo.rs");
    s.resolvePrompt(SID, "q1", "✅ answered: a");
    t = useTranscripts.getState().sessions[KEY];
    expect(t?.pendingPermissions).toEqual([]);
    expect(t?.pendingQuestions).toEqual([]);
    expect(t?.receipts.map((r) => r.text)).toEqual(["✅ allowed Edit on src/foo.rs", "✅ answered: a"]);
  });

  test("re-delivered prompt with same request_id does not duplicate", () => {
    const req = { request_id: "r1", tool: "Bash", input_json: "{}", suggestions: [] };
    const s = useTranscripts.getState();
    s.addPermission(SID, req);
    s.addPermission(SID, req);
    expect(useTranscripts.getState().sessions[KEY]?.pendingPermissions).toHaveLength(1);
  });
});

test("emptyTranscript shape", () => {
  const t = emptyTranscript();
  expect(t.order).toEqual([]);
  expect(t.total).toBe(0);
  expect(t.opened).toBe(false);
});

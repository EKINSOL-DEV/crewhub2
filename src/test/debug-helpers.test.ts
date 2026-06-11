import { describe, expect, test } from "vitest";
import type { SessionEvent, SessionMeta, SessionStatus } from "@/ipc/bindings";
import {
  appendToTail,
  applyPermissionEvent,
  applySessionEvent,
  MAX_TAIL,
  removePending,
  sessionKey,
  shortId,
  statusEmoji,
  type PendingPermission,
} from "@/panels/debug/helpers";

function meta(id: string, status: SessionStatus = "Working"): SessionMeta {
  return {
    id: { provider: "claude-code", id },
    origin: "Managed",
    project_path: "/tmp/p",
    model: "haiku",
    status,
    activity_detail: null,
    parent: null,
    team: null,
    usage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0 },
    git_branch: null,
    last_activity_ms: 0,
  };
}

const itemEvent: SessionEvent = {
  type: "Item",
  data: {
    id: { provider: "claude-code", id: "s1" },
    item: { kind: "UserText", data: { text: "hi", ts: 1 } },
    seq: 1,
  },
};

describe("appendToTail", () => {
  test("appends and keeps at most MAX_TAIL entries", () => {
    let tail: SessionEvent[] = [];
    for (let i = 0; i < MAX_TAIL + 50; i++) {
      tail = appendToTail(tail, itemEvent);
    }
    expect(tail).toHaveLength(MAX_TAIL);
  });

  test("keeps the newest entries when trimming", () => {
    const old: SessionEvent = { type: "Removed", data: { id: { provider: "p", id: "old" } } };
    let tail: SessionEvent[] = [old];
    for (let i = 0; i < MAX_TAIL; i++) tail = appendToTail(tail, itemEvent);
    expect(tail[0]).toEqual(itemEvent);
    expect(tail).not.toContainEqual(old);
  });
});

describe("statusEmoji", () => {
  test("maps every status to its glyph", () => {
    expect(statusEmoji("Working")).toBe("🟢");
    expect(statusEmoji("WaitingForInput")).toBe("🕐");
    expect(statusEmoji("WaitingForPermission")).toBe("🔐");
    expect(statusEmoji("Idle")).toBe("💤");
    expect(statusEmoji("Ended")).toBe("🔚");
  });
});

describe("applySessionEvent", () => {
  test("Discovered/Updated upsert, Removed deletes", () => {
    const m = meta("s1");
    let sessions = applySessionEvent({}, { type: "Discovered", data: { meta: m } });
    expect(sessions[sessionKey(m.id)]).toEqual(m);

    const updated = { ...m, status: "Idle" as const };
    sessions = applySessionEvent(sessions, { type: "Updated", data: { meta: updated } });
    expect(sessions[sessionKey(m.id)]?.status).toBe("Idle");

    sessions = applySessionEvent(sessions, { type: "Removed", data: { id: m.id } });
    expect(sessions).toEqual({});
  });

  test("non-meta events leave the map untouched (same reference)", () => {
    const sessions = { [sessionKey(meta("s1").id)]: meta("s1") };
    expect(applySessionEvent(sessions, itemEvent)).toBe(sessions);
  });
});

describe("applyPermissionEvent", () => {
  const request: SessionEvent = {
    type: "PermissionRequest",
    data: {
      id: { provider: "claude-code", id: "s1" },
      request: { request_id: "r1", tool: "Bash", input_json: "{}", suggestions: [] },
    },
  };

  test("adds a request once, dedupes by request_id", () => {
    let pending: PendingPermission[] = [];
    pending = applyPermissionEvent(pending, request);
    pending = applyPermissionEvent(pending, request);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.request.request_id).toBe("r1");
  });

  test("clears requests when the session leaves the permission state", () => {
    let pending = applyPermissionEvent([], request);
    pending = applyPermissionEvent(pending, {
      type: "Updated",
      data: { meta: meta("s1", "WaitingForPermission") },
    });
    expect(pending).toHaveLength(1);
    pending = applyPermissionEvent(pending, {
      type: "Updated",
      data: { meta: meta("s1", "Working") },
    });
    expect(pending).toHaveLength(0);
  });

  test("clears requests when the session is removed", () => {
    const pending = applyPermissionEvent([], request);
    expect(
      applyPermissionEvent(pending, {
        type: "Removed",
        data: { id: { provider: "claude-code", id: "s1" } },
      }),
    ).toHaveLength(0);
  });

  test("removePending drops exactly the answered request", () => {
    const pending = applyPermissionEvent([], request);
    expect(removePending(pending, "r1")).toHaveLength(0);
    expect(removePending(pending, "other")).toHaveLength(1);
  });
});

describe("shortId", () => {
  test("truncates long ids and keeps short ones", () => {
    expect(shortId("0123456789abcdef")).toBe("01234567");
    expect(shortId("abc")).toBe("abc");
  });
});

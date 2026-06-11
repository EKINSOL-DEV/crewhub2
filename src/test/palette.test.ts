import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import {
  filterActions,
  rankActions,
  resetPaletteForTests,
  scoreToken,
  usePalette,
  winkHint,
  WINK_HINTS,
  type PaletteAction,
} from "../stores/palette";

function act(id: string, label: string, keywords: string[] = []): PaletteAction {
  return { id, label, group: "Test", keywords, run: () => {} };
}

beforeEach(resetPaletteForTests);
afterEach(clearMocks);

describe("scoreToken", () => {
  const a = act("a", "Open Chat panel", ["conversation", "messages"]);

  test("label prefix > label substring > keyword prefix > keyword substring > subsequence", () => {
    expect(scoreToken(a, "open")).toBe(100);
    expect(scoreToken(a, "chat")).toBe(80);
    expect(scoreToken(a, "conv")).toBe(60);
    expect(scoreToken(a, "essag")).toBe(50);
    expect(scoreToken(a, "ocp")).toBe(30); // subsequence of "open chat panel"
    expect(scoreToken(a, "zzz")).toBe(-1);
  });

  test("single-char tokens never match as subsequence noise", () => {
    expect(scoreToken(act("x", "Bcd"), "z")).toBe(-1);
  });
});

describe("filterActions", () => {
  const actions = [
    act("chat", "Open Chat panel", ["conversation"]),
    act("sessions", "Open Sessions panel", ["live", "running"]),
    act("theme", "Switch theme", ["appearance", "dark"]),
    act("spawn", "Spawn session", ["scout", "new", "claude"]),
  ];

  test("matches across label and keywords", () => {
    expect(filterActions(actions, "chat").map((a) => a.id)).toEqual(["chat"]);
    expect(filterActions(actions, "scout").map((a) => a.id)).toEqual(["spawn"]);
  });

  test("every token must match (multi-word queries)", () => {
    expect(filterActions(actions, "open panel").map((a) => a.id)).toEqual(["chat", "sessions"]);
    expect(filterActions(actions, "open zebra")).toEqual([]);
  });

  test("recents boost equally-scored actions", () => {
    const tie = [act("one", "Open A panel"), act("two", "Open B panel")];
    expect(filterActions(tie, "open", ["two"]).map((a) => a.id)).toEqual(["two", "one"]);
  });

  test("empty query falls back to recents-first ranking", () => {
    expect(filterActions(actions, "  ", ["theme"]).map((a) => a.id)[0]).toBe("theme");
  });
});

describe("rankActions", () => {
  test("recents first in recency order, rest stable", () => {
    const actions = [act("a", "A"), act("b", "B"), act("c", "C")];
    expect(rankActions(actions, ["c", "a"]).map((x) => x.id)).toEqual(["c", "a", "b"]);
    expect(rankActions(actions, []).map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(rankActions(actions, ["gone"]).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});

describe("winkHint", () => {
  test("cycles through the hint list", () => {
    expect(winkHint(0)).toBe(WINK_HINTS[0]);
    expect(winkHint(WINK_HINTS.length)).toBe(WINK_HINTS[0]);
    expect(winkHint(1)).toBe(WINK_HINTS[1]);
  });
});

describe("palette store", () => {
  test("registerActions adds a source; later registrations extend without palette changes", () => {
    usePalette.getState().registerActions("shell", [act("a", "A")]);
    expect(usePalette.getState().allActions()).toHaveLength(1);
    const unregister = usePalette.getState().registerActions("m3-panel", [act("b", "B"), act("c", "C")]);
    expect(usePalette.getState().allActions()).toHaveLength(3);
    unregister();
    expect(usePalette.getState().allActions()).toHaveLength(1);
  });

  test("re-registering a source replaces its actions", () => {
    usePalette.getState().registerActions("shell", [act("a", "A")]);
    usePalette.getState().registerActions("shell", [act("b", "B")]);
    expect(
      usePalette
        .getState()
        .allActions()
        .map((a) => a.id),
    ).toEqual(["b"]);
  });

  test("recordRun puts the action first, dedupes, caps at 8 and persists", () => {
    const writes: Array<{ key: string; value: string }> = [];
    mockIPC((cmd, args) => {
      if (cmd === "set_setting") {
        writes.push(args as { key: string; value: string });
        return null;
      }
      return null;
    });
    for (let i = 0; i < 10; i++) usePalette.getState().recordRun(`a${i}`);
    usePalette.getState().recordRun("a5");
    const recents = usePalette.getState().recents;
    expect(recents[0]).toBe("a5");
    expect(recents).toHaveLength(8);
    expect(new Set(recents).size).toBe(8);
    const last = writes[writes.length - 1];
    expect(last?.key).toBe("palette.recents");
    expect(JSON.parse(last!.value)[0]).toBe("a5");
  });

  test("load restores recents and ignores corrupt JSON", async () => {
    mockIPC((cmd, args) => {
      if (cmd === "get_setting" && (args as { key: string }).key === "palette.recents")
        return JSON.stringify(["x", "y"]);
      return null;
    });
    await usePalette.getState().load();
    expect(usePalette.getState().recents).toEqual(["x", "y"]);

    resetPaletteForTests();
    clearMocks();
    mockIPC((cmd) => (cmd === "get_setting" ? "{broken" : null));
    await usePalette.getState().load();
    expect(usePalette.getState().recents).toEqual([]);
  });

  test("setOpen(true) advances the wink counter", () => {
    const before = usePalette.getState().openCount;
    usePalette.getState().setOpen(true);
    usePalette.getState().setOpen(false);
    usePalette.getState().setOpen(true);
    expect(usePalette.getState().openCount).toBe(before + 2);
  });
});

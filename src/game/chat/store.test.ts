import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/ipc/bindings", () => ({
  commands: {
    getSetting: vi.fn(async () => ({ status: "ok", data: null })),
    setSetting: vi.fn(async () => ({ status: "ok", data: null })),
  },
}));

import { commands } from "@/ipc/bindings";
import { GAME_CHAT_LAYOUT_KEY, resetGameChatsForTests, useGameChats } from "./store";

describe("useGameChats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGameChatsForTests();
  });

  it("opens a chat, un-minimized", () => {
    useGameChats.getState().open("a");
    expect(useGameChats.getState().chats).toEqual([{ key: "a", min: false }]);
  });

  it("re-opening an already-open chat dedupes, un-minimizes, and raises it", () => {
    useGameChats.getState().open("a");
    useGameChats.getState().open("b");
    useGameChats.getState().setMin("a", true);
    useGameChats.getState().open("a");
    expect(useGameChats.getState().chats).toEqual([
      { key: "b", min: false },
      { key: "a", min: false },
    ]);
  });

  it("re-opening an already-open, already-dragged chat keeps its position", () => {
    useGameChats.getState().open("a");
    useGameChats.getState().setPos("a", { x: 10, y: 20 });
    useGameChats.getState().open("a");
    expect(useGameChats.getState().chats).toEqual([{ key: "a", min: false }]);
    expect(useGameChats.getState().layout.a).toEqual({ pos: { x: 10, y: 20 }, size: null });
  });

  it("caps at 3 open chats, evicting the oldest", () => {
    useGameChats.getState().open("a");
    useGameChats.getState().open("b");
    useGameChats.getState().open("c");
    useGameChats.getState().open("d");
    expect(useGameChats.getState().chats.map((c) => c.key)).toEqual(["b", "c", "d"]);
  });

  it("closes a chat", () => {
    useGameChats.getState().open("a");
    useGameChats.getState().open("b");
    useGameChats.getState().close("a");
    expect(useGameChats.getState().chats).toEqual([{ key: "b", min: false }]);
  });

  it("closing a chat keeps its layout — reopening later still remembers it", () => {
    useGameChats.getState().open("a");
    useGameChats.getState().setPos("a", { x: 5, y: 6 });
    useGameChats.getState().close("a");
    expect(useGameChats.getState().layout.a).toEqual({ pos: { x: 5, y: 6 }, size: null });
    useGameChats.getState().open("a");
    expect(useGameChats.getState().layout.a).toEqual({ pos: { x: 5, y: 6 }, size: null });
  });

  it("setMin toggles minimized state without reordering", () => {
    useGameChats.getState().open("a");
    useGameChats.getState().open("b");
    useGameChats.getState().setMin("a", true);
    expect(useGameChats.getState().chats).toEqual([
      { key: "a", min: true },
      { key: "b", min: false },
    ]);
  });

  it("raise moves a chat to the top of the stack without changing min", () => {
    useGameChats.getState().open("a");
    useGameChats.getState().open("b");
    useGameChats.getState().setMin("a", true);
    useGameChats.getState().raise("a");
    expect(useGameChats.getState().chats).toEqual([
      { key: "b", min: false },
      { key: "a", min: true },
    ]);
  });

  it("raise is a no-op when the chat is already on top", () => {
    useGameChats.getState().open("a");
    useGameChats.getState().open("b");
    useGameChats.getState().raise("b");
    expect(useGameChats.getState().chats.map((c) => c.key)).toEqual(["a", "b"]);
  });

  describe("setPos / setSize (per-chat layout)", () => {
    it("sets a chat's drag position", () => {
      useGameChats.getState().open("a");
      useGameChats.getState().setPos("a", { x: 50, y: 60 });
      expect(useGameChats.getState().layout.a).toEqual({ pos: { x: 50, y: 60 }, size: null });
    });

    it("clears a position back to null (rejoins the default stack) without touching size", () => {
      useGameChats.getState().open("a");
      useGameChats.getState().setPos("a", { x: 50, y: 60 });
      useGameChats.getState().setSize("a", { w: 400, h: 500 });
      useGameChats.getState().setPos("a", null);
      expect(useGameChats.getState().layout.a).toEqual({ pos: null, size: { w: 400, h: 500 } });
    });

    it("sets a chat's resized size independently of pos", () => {
      useGameChats.getState().open("a");
      useGameChats.getState().setSize("a", { w: 500, h: 600 });
      expect(useGameChats.getState().layout.a).toEqual({ pos: null, size: { w: 500, h: 600 } });
    });

    it("setPos then setSize preserves both on the same entry", () => {
      useGameChats.getState().open("a");
      useGameChats.getState().setPos("a", { x: 1, y: 2 });
      useGameChats.getState().setSize("a", { w: 400, h: 500 });
      expect(useGameChats.getState().layout.a).toEqual({ pos: { x: 1, y: 2 }, size: { w: 400, h: 500 } });
    });

    it("only touches the targeted key — other chats' layout is untouched", () => {
      useGameChats.getState().open("a");
      useGameChats.getState().open("b");
      useGameChats.getState().setPos("a", { x: 1, y: 2 });
      expect(useGameChats.getState().layout.a).toEqual({ pos: { x: 1, y: 2 }, size: null });
      expect(useGameChats.getState().layout.b).toBeUndefined();
    });

    it("survives an unrelated chat opening or closing (layout isn't tied to stack membership)", () => {
      useGameChats.getState().open("a");
      useGameChats.getState().open("b");
      useGameChats.getState().setPos("a", { x: 1, y: 2 });
      useGameChats.getState().open("c");
      useGameChats.getState().close("b");
      expect(useGameChats.getState().layout.a).toEqual({ pos: { x: 1, y: 2 }, size: null });
    });
  });

  describe("addLocalLine", () => {
    it("appends a line for a key, with a who/text and a wall-clock ts", () => {
      useGameChats.getState().addLocalLine("a", "note", "🏃 heading to HQ");
      const [line] = useGameChats.getState().localLines.a!;
      expect(line).toMatchObject({ who: "note", text: "🏃 heading to HQ" });
      expect(typeof line!.ts).toBe("number");
    });

    it("keeps per-key lines separate — one chat's lines never leak into another's", () => {
      useGameChats.getState().addLocalLine("a", "note", "for a");
      useGameChats.getState().addLocalLine("b", "bot", "for b");
      expect(useGameChats.getState().localLines.a).toHaveLength(1);
      expect(useGameChats.getState().localLines.b).toHaveLength(1);
      expect(useGameChats.getState().localLines.a![0]!.text).toBe("for a");
      expect(useGameChats.getState().localLines.b![0]!.text).toBe("for b");
    });

    it("appends in call order and assigns each line a distinct seq (no key collisions to worry about downstream)", () => {
      useGameChats.getState().addLocalLine("a", "note", "first");
      useGameChats.getState().addLocalLine("a", "bot", "second");
      const lines = useGameChats.getState().localLines.a!;
      expect(lines.map((l) => l.text)).toEqual(["first", "second"]);
      expect(new Set(lines.map((l) => l.seq)).size).toBe(2);
      // Synthetic seqs are negative — never able to collide with a real
      // (always >= 0) transcript seq once merged in use-chat-session.ts.
      for (const l of lines) expect(l.seq).toBeLessThan(0);
    });

    it("survives being read again later (no auto-clear) — cheap and avoids losing feedback on reopen", () => {
      useGameChats.getState().addLocalLine("a", "note", "still here");
      useGameChats.getState().open("a");
      useGameChats.getState().close("a");
      expect(useGameChats.getState().localLines.a).toHaveLength(1);
    });

    it("marks a 'user' line with echo:true when opts.echo is set (the optimistic send echo)", () => {
      useGameChats.getState().addLocalLine("a", "user", "hi there", { echo: true });
      const [line] = useGameChats.getState().localLines.a!;
      expect(line).toMatchObject({ who: "user", text: "hi there", echo: true });
    });

    it("leaves echo unset (falsy) for a plain note/bot line, or a 'user' line with no opts", () => {
      useGameChats.getState().addLocalLine("a", "note", "no echo here");
      useGameChats.getState().addLocalLine("a", "user", "plain user line");
      const [note, user] = useGameChats.getState().localLines.a!;
      expect(note!.echo).toBeFalsy();
      expect(user!.echo).toBeFalsy();
    });

    it("caps a chat's local lines at 200, dropping the oldest first", () => {
      for (let i = 0; i < 205; i++) useGameChats.getState().addLocalLine("a", "note", `line ${i}`);
      const lines = useGameChats.getState().localLines.a!;
      expect(lines).toHaveLength(200);
      expect(lines[0]!.text).toBe("line 5"); // the first 5 (0-4) were dropped
      expect(lines[lines.length - 1]!.text).toBe("line 204");
    });
  });

  describe("layout persistence (EKI resize follow-up)", () => {
    it("debounces persistence — a burst of setPos/setSize calls writes exactly once, 500ms after the last one", async () => {
      vi.useFakeTimers();
      try {
        useGameChats.getState().open("a");
        useGameChats.getState().setPos("a", { x: 1, y: 2 });
        useGameChats.getState().setSize("a", { w: 400, h: 500 });
        useGameChats.getState().setPos("a", { x: 3, y: 4 });
        expect(commands.setSetting).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(499);
        expect(commands.setSetting).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(2);
        expect(commands.setSetting).toHaveBeenCalledTimes(1);
        expect(commands.setSetting).toHaveBeenCalledWith(
          GAME_CHAT_LAYOUT_KEY,
          JSON.stringify({ a: { x: 3, y: 4, w: 400, h: 500 } }),
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it("omits an empty (pos:null,size:null) entry from the persisted blob", async () => {
      vi.useFakeTimers();
      try {
        useGameChats.getState().open("a");
        useGameChats.getState().setPos("a", { x: 1, y: 2 });
        useGameChats.getState().setPos("a", null);
        await vi.advanceTimersByTimeAsync(500);
        expect(commands.setSetting).toHaveBeenCalledWith(GAME_CHAT_LAYOUT_KEY, JSON.stringify({}));
      } finally {
        vi.useRealTimers();
      }
    });

    it("persists a size-only entry without an x/y pair", async () => {
      vi.useFakeTimers();
      try {
        useGameChats.getState().open("a");
        useGameChats.getState().setSize("a", { w: 400, h: 500 });
        await vi.advanceTimersByTimeAsync(500);
        expect(commands.setSetting).toHaveBeenCalledWith(
          GAME_CHAT_LAYOUT_KEY,
          JSON.stringify({ a: { w: 400, h: 500 } }),
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it("loadLayout populates the layout map from the settings KV", async () => {
      vi.mocked(commands.getSetting).mockResolvedValueOnce({
        status: "ok",
        data: JSON.stringify({ a: { x: 10, y: 20, w: 400, h: 500 } }),
      } as never);
      await useGameChats.getState().loadLayout();
      expect(useGameChats.getState().layout.a).toEqual({ pos: { x: 10, y: 20 }, size: { w: 400, h: 500 } });
    });

    it("loadLayout tolerates a pos-only or size-only entry", async () => {
      vi.mocked(commands.getSetting).mockResolvedValueOnce({
        status: "ok",
        data: JSON.stringify({ a: { x: 10, y: 20 }, b: { w: 400, h: 500 } }),
      } as never);
      await useGameChats.getState().loadLayout();
      expect(useGameChats.getState().layout.a).toEqual({ pos: { x: 10, y: 20 }, size: null });
      expect(useGameChats.getState().layout.b).toEqual({ pos: null, size: { w: 400, h: 500 } });
    });

    it("loadLayout clamps an oversized persisted window to the current viewport", async () => {
      vi.mocked(commands.getSetting).mockResolvedValueOnce({
        status: "ok",
        data: JSON.stringify({ a: { x: 0, y: 0, w: 5000, h: 5000 } }),
      } as never);
      await useGameChats.getState().loadLayout();
      const { size } = useGameChats.getState().layout.a!;
      expect(size!.w).toBeLessThanOrEqual(640);
      expect(size!.h).toBeLessThan(5000);
    });

    it("loadLayout tolerates corrupt JSON, falling back to an empty layout", async () => {
      vi.mocked(commands.getSetting).mockResolvedValueOnce({ status: "ok", data: "not json{{{" } as never);
      await useGameChats.getState().loadLayout();
      expect(useGameChats.getState().layout).toEqual({});
    });

    it("loadLayout tolerates a non-object root (e.g. an array or a number)", async () => {
      vi.mocked(commands.getSetting).mockResolvedValueOnce({ status: "ok", data: "[1,2,3]" } as never);
      await useGameChats.getState().loadLayout();
      expect(useGameChats.getState().layout).toEqual({});
    });

    it("loadLayout skips a per-key entry with the wrong shape (neither x/y nor w/h are numbers)", async () => {
      vi.mocked(commands.getSetting).mockResolvedValueOnce({
        status: "ok",
        data: JSON.stringify({ a: { x: "nope", y: 2 }, b: "not-an-object" }),
      } as never);
      await useGameChats.getState().loadLayout();
      expect(useGameChats.getState().layout).toEqual({});
    });

    it("loadLayout only fetches once per app run", async () => {
      await useGameChats.getState().loadLayout();
      await useGameChats.getState().loadLayout();
      expect(commands.getSetting).toHaveBeenCalledTimes(1);
    });

    it("an in-session value set before loadLayout resolves wins over the fetched one (race guard)", async () => {
      vi.mocked(commands.getSetting).mockResolvedValueOnce({
        status: "ok",
        data: JSON.stringify({ a: { x: 10, y: 20 } }),
      } as never);
      const promise = useGameChats.getState().loadLayout();
      useGameChats.getState().setPos("a", { x: 99, y: 88 });
      await promise;
      expect(useGameChats.getState().layout.a?.pos).toEqual({ x: 99, y: 88 });
    });
  });
});

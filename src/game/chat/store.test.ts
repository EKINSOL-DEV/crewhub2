import { beforeEach, describe, expect, it } from "vitest";
import { useGameChats } from "./store";

describe("useGameChats", () => {
  beforeEach(() => useGameChats.setState({ chats: [], localLines: {} }));

  it("opens a chat, un-minimized", () => {
    useGameChats.getState().open("a");
    expect(useGameChats.getState().chats).toEqual([{ key: "a", min: false, pos: null }]);
  });

  it("re-opening an already-open chat dedupes, un-minimizes, and raises it", () => {
    useGameChats.getState().open("a");
    useGameChats.getState().open("b");
    useGameChats.getState().setMin("a", true);
    useGameChats.getState().open("a");
    expect(useGameChats.getState().chats).toEqual([
      { key: "b", min: false, pos: null },
      { key: "a", min: false, pos: null },
    ]);
  });

  it("re-opening an already-open, already-dragged chat keeps its position", () => {
    useGameChats.getState().open("a");
    useGameChats.getState().setPos("a", { x: 10, y: 20 });
    useGameChats.getState().open("a");
    expect(useGameChats.getState().chats).toEqual([{ key: "a", min: false, pos: { x: 10, y: 20 } }]);
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
    expect(useGameChats.getState().chats).toEqual([{ key: "b", min: false, pos: null }]);
  });

  it("setMin toggles minimized state without reordering", () => {
    useGameChats.getState().open("a");
    useGameChats.getState().open("b");
    useGameChats.getState().setMin("a", true);
    expect(useGameChats.getState().chats).toEqual([
      { key: "a", min: true, pos: null },
      { key: "b", min: false, pos: null },
    ]);
  });

  it("raise moves a chat to the top of the stack without changing min", () => {
    useGameChats.getState().open("a");
    useGameChats.getState().open("b");
    useGameChats.getState().setMin("a", true);
    useGameChats.getState().raise("a");
    expect(useGameChats.getState().chats).toEqual([
      { key: "b", min: false, pos: null },
      { key: "a", min: true, pos: null },
    ]);
  });

  describe("setPos", () => {
    it("sets a chat's drag position", () => {
      useGameChats.getState().open("a");
      useGameChats.getState().setPos("a", { x: 50, y: 60 });
      expect(useGameChats.getState().chats).toEqual([{ key: "a", min: false, pos: { x: 50, y: 60 } }]);
    });

    it("clears a position back to null (rejoins the default stack)", () => {
      useGameChats.getState().open("a");
      useGameChats.getState().setPos("a", { x: 50, y: 60 });
      useGameChats.getState().setPos("a", null);
      expect(useGameChats.getState().chats).toEqual([{ key: "a", min: false, pos: null }]);
    });

    it("only touches the targeted key — other chats' positions are untouched", () => {
      useGameChats.getState().open("a");
      useGameChats.getState().open("b");
      useGameChats.getState().setPos("a", { x: 1, y: 2 });
      expect(useGameChats.getState().chats).toEqual([
        { key: "a", min: false, pos: { x: 1, y: 2 } },
        { key: "b", min: false, pos: null },
      ]);
    });

    it("survives an unrelated chat opening or closing (drag position isn't tied to stack membership)", () => {
      useGameChats.getState().open("a");
      useGameChats.getState().open("b");
      useGameChats.getState().setPos("a", { x: 1, y: 2 });
      useGameChats.getState().open("c");
      useGameChats.getState().close("b");
      expect(useGameChats.getState().chats.find((c) => c.key === "a")).toEqual({
        key: "a",
        min: false,
        pos: { x: 1, y: 2 },
      });
    });
  });

  it("raise is a no-op when the chat is already on top", () => {
    useGameChats.getState().open("a");
    useGameChats.getState().open("b");
    useGameChats.getState().raise("b");
    expect(useGameChats.getState().chats.map((c) => c.key)).toEqual(["a", "b"]);
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
});

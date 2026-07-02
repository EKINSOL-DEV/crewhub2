import { beforeEach, describe, expect, it } from "vitest";
import { useGameChats } from "./store";

describe("useGameChats", () => {
  beforeEach(() => useGameChats.setState({ chats: [] }));

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
});

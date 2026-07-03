// ChatWindows (M2 T3 host, drag-position stacking): this is a thin wiring
// component — it resolves name/color and hands each chat's stackIndex/pos/
// size/onDrag/onResize down to <ChatWindow>. Rather than re-render a full
// ChatWindow tree (chat-window.test.tsx already covers that), ChatWindow
// itself is mocked to a prop-capturing stub so the stacking/compaction math
// can be asserted on directly.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import type { ChatWindowProps } from "./ChatWindow";

const capturedProps: ChatWindowProps[] = [];

vi.mock("./ChatWindow", () => ({
  ChatWindow: (props: ChatWindowProps) => {
    capturedProps.push(props);
    return null;
  },
}));

vi.mock("@/stores/sessions", () => ({ useSessionsView: () => [] }));

import { ChatWindows } from "./ChatWindows";
import { resetGameChatsForTests, useGameChats } from "./store";

beforeEach(() => {
  capturedProps.length = 0;
  resetGameChatsForTests();
});

function propsFor(key: string): ChatWindowProps {
  const found = capturedProps.find((p) => p.chatKey === key);
  if (!found) throw new Error(`no ChatWindow render captured for ${key}`);
  return found;
}

describe("ChatWindows", () => {
  it("assigns a compacting stackIndex across null-pos windows only, in stack order", () => {
    useGameChats.getState().open("a");
    useGameChats.getState().open("b");
    useGameChats.getState().open("c");
    render(<ChatWindows />);
    expect(propsFor("a").stackIndex).toBe(0);
    expect(propsFor("b").stackIndex).toBe(1);
    expect(propsFor("c").stackIndex).toBe(2);
  });

  it("skips a dragged (non-null pos) window when compacting the remaining stackIndexes", () => {
    useGameChats.getState().open("a");
    useGameChats.getState().open("b");
    useGameChats.getState().open("c");
    useGameChats.getState().setPos("b", { x: 10, y: 20 });
    render(<ChatWindows />);
    expect(propsFor("a").stackIndex).toBe(0);
    // "b" left the stack — "c" compacts into slot 1, not 2.
    expect(propsFor("c").stackIndex).toBe(1);
  });

  it("passes each chat's pos straight through", () => {
    useGameChats.getState().open("a");
    useGameChats.getState().open("b");
    useGameChats.getState().setPos("b", { x: 10, y: 20 });
    render(<ChatWindows />);
    expect(propsFor("a").pos).toBeNull();
    expect(propsFor("b").pos).toEqual({ x: 10, y: 20 });
  });

  it("passes each chat's size straight through, null when never resized", () => {
    useGameChats.getState().open("a");
    useGameChats.getState().open("b");
    useGameChats.getState().setSize("b", { w: 500, h: 600 });
    render(<ChatWindows />);
    expect(propsFor("a").size).toBeNull();
    expect(propsFor("b").size).toEqual({ w: 500, h: 600 });
  });

  it("wires onDrag to setPos for the chat's own key only", () => {
    useGameChats.getState().open("a");
    useGameChats.getState().open("b");
    render(<ChatWindows />);
    act(() => propsFor("a").onDrag({ x: 5, y: 6 }));
    expect(useGameChats.getState().layout.a?.pos).toEqual({ x: 5, y: 6 });
    expect(useGameChats.getState().layout.b?.pos ?? null).toBeNull();
  });

  it("wires onResize to setSize for the chat's own key only", () => {
    useGameChats.getState().open("a");
    useGameChats.getState().open("b");
    render(<ChatWindows />);
    act(() => propsFor("a").onResize({ w: 400, h: 500 }));
    expect(useGameChats.getState().layout.a?.size).toEqual({ w: 400, h: 500 });
    expect(useGameChats.getState().layout.b?.size ?? null).toBeNull();
  });

  it("a dragged window keeps its position when another chat opens", () => {
    useGameChats.getState().open("a");
    useGameChats.getState().setPos("a", { x: 1, y: 2 });
    useGameChats.getState().open("b");
    render(<ChatWindows />);
    expect(propsFor("a").pos).toEqual({ x: 1, y: 2 });
  });

  it("a dragged window keeps its position when another chat closes", () => {
    useGameChats.getState().open("a");
    useGameChats.getState().open("b");
    useGameChats.getState().setPos("a", { x: 1, y: 2 });
    useGameChats.getState().close("b");
    render(<ChatWindows />);
    expect(propsFor("a").pos).toEqual({ x: 1, y: 2 });
  });

  it("kicks off loadLayout() once on mount (best-effort; a real IPC failure is swallowed)", async () => {
    useGameChats.getState().open("a");
    render(<ChatWindows />);
    // loadLayout() is fire-and-forget here — just assert it doesn't throw and
    // the store's single-fetch guard is honored (store.test.ts covers the
    // guard/parse/clamp behavior itself in isolation).
    await act(async () => {
      await Promise.resolve();
    });
    expect(useGameChats.getState().chats.map((c) => c.key)).toEqual(["a"]);
  });
});

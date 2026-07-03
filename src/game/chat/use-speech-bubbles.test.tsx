// M7 T3: pushLocalBubble shares the same store (hence TTL + precedence) as
// the engine-event-driven bubbles useGameSpeechBubbles already tracked —
// Characters.tsx's "speech wins over thought" logic can't tell a local push
// from a transcript-derived one apart, by design.
import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionEvent } from "@/ipc/bindings";

const { onEngineEventMock } = vi.hoisted(() => ({ onEngineEventMock: vi.fn() }));
vi.mock("@/ipc/events", () => ({ onEngineEvent: onEngineEventMock }));

import { pruneSpeech, SPEECH_TTL_MS, type SpeechMap } from "./speech";
import { pushLocalBubble, resetSpeechBubblesForTests, useGameSpeechBubbles } from "./use-speech-bubbles";

function Probe({ onMap }: { onMap: (m: SpeechMap) => void }) {
  const map = useGameSpeechBubbles();
  onMap(map);
  return null;
}

function itemEvent(id: string, text: string): SessionEvent {
  return {
    type: "Item",
    data: {
      id: { provider: "claude", id },
      seq: 1,
      item: { kind: "AssistantText", data: { text, ts: 0 } } as never,
    },
  };
}

let latest: SpeechMap = {};
function renderProbe() {
  render(<Probe onMap={(m) => (latest = m)} />);
}

describe("pushLocalBubble", () => {
  beforeEach(() => {
    resetSpeechBubblesForTests();
    latest = {};
    onEngineEventMock.mockReset().mockImplementation(() => Promise.resolve(() => {}));
  });

  it("adds a bubble the hook's map picks up", () => {
    renderProbe();
    act(() => pushLocalBubble("demo:ada", "On my way! 🏃"));
    expect(latest["demo:ada"]).toMatchObject({ text: "On my way! 🏃" });
  });

  it("collapses whitespace and clamps length the same way trimSpeech does for transcript bubbles", () => {
    renderProbe();
    act(() => pushLocalBubble("a", "  hi   there  "));
    expect(latest.a?.text).toBe("hi there");
  });

  it("ignores an empty/whitespace-only push (no bubble, no stale entry)", () => {
    renderProbe();
    act(() => pushLocalBubble("a", "   "));
    expect(latest.a).toBeUndefined();
  });

  it("expires under pruneSpeech on the same TTL as engine-derived bubbles", () => {
    renderProbe();
    const now = 1_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    act(() => pushLocalBubble("a", "hi"));
    vi.restoreAllMocks();

    expect(pruneSpeech(latest, now + 1)).toEqual(latest); // still fresh
    expect(pruneSpeech(latest, now + SPEECH_TTL_MS + 1)).toEqual({}); // expired, same TTL constant
  });

  it("shares one map with engine-derived speech: a later AssistantText event overwrites a local push for the same key", () => {
    let handler: ((e: SessionEvent) => void) | undefined;
    onEngineEventMock.mockImplementation((cb: (e: SessionEvent) => void) => {
      handler = cb;
      return Promise.resolve(() => {});
    });
    renderProbe();
    act(() => pushLocalBubble("claude:s1", "local reply"));
    expect(latest["claude:s1"]?.text).toBe("local reply");

    act(() => handler?.(itemEvent("s1", "actual transcript reply")));
    expect(latest["claude:s1"]?.text).toBe("actual transcript reply");
  });

  it("keeps a local push for one bot and an event-derived bubble for another side by side", () => {
    let handler: ((e: SessionEvent) => void) | undefined;
    onEngineEventMock.mockImplementation((cb: (e: SessionEvent) => void) => {
      handler = cb;
      return Promise.resolve(() => {});
    });
    renderProbe();
    act(() => pushLocalBubble("demo:ada", "On my way! 🏃"));
    act(() => handler?.(itemEvent("s1", "hello")));

    expect(latest["demo:ada"]?.text).toBe("On my way! 🏃");
    expect(latest["claude:s1"]?.text).toBe("hello");
  });
});

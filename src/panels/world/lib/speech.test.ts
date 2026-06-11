// Speech bubbles (EKI-66): pure fold over EngineEvents — a bot "says" its
// latest AssistantText for a few seconds.
import { describe, expect, it } from "vitest";
import type { SessionEvent } from "@/ipc/bindings";
import { SPEECH_TTL_MS, pruneSpeech, speechFromEvent, trimSpeech } from "./speech";

function itemEvent(id: string, kind: "AssistantText" | "UserText", text: string): SessionEvent {
  return {
    type: "Item",
    data: {
      id: { provider: "claude", id },
      seq: 1,
      item: { kind, data: { text, ts: 0 } } as never,
    },
  };
}

describe("speechFromEvent", () => {
  it("captures AssistantText items keyed by session", () => {
    const got = speechFromEvent(itemEvent("s1", "AssistantText", "Hello there!"), 1000);
    expect(got).toEqual({ key: "claude:s1", entry: { text: "Hello there!", ts: 1000 } });
  });

  it("ignores non-Item events and non-assistant items", () => {
    expect(speechFromEvent(itemEvent("s1", "UserText", "hi"), 0)).toBeNull();
    expect(
      speechFromEvent({ type: "Removed", data: { id: { provider: "claude", id: "s1" } } }, 0),
    ).toBeNull();
  });

  it("trims long monologues down to bubble size", () => {
    const long = "x".repeat(500);
    const got = speechFromEvent(itemEvent("s1", "AssistantText", long), 0)!;
    expect(got.entry.text.length).toBeLessThanOrEqual(141);
    expect(got.entry.text.endsWith("…")).toBe(true);
  });

  it("skips empty/whitespace-only text", () => {
    expect(speechFromEvent(itemEvent("s1", "AssistantText", "   \n"), 0)).toBeNull();
  });
});

describe("pruneSpeech", () => {
  it("drops entries older than SPEECH_TTL_MS and keeps fresh ones", () => {
    const map = { a: { text: "old", ts: 0 }, b: { text: "new", ts: 9000 } };
    expect(pruneSpeech(map, SPEECH_TTL_MS + 1)).toEqual({ b: { text: "new", ts: 9000 } });
  });

  it("returns the same reference when nothing expired (no re-renders)", () => {
    const map = { a: { text: "hi", ts: 100 } };
    expect(pruneSpeech(map, 200)).toBe(map);
  });
});

describe("trimSpeech", () => {
  it("collapses whitespace and cuts at the limit with an ellipsis", () => {
    expect(trimSpeech("a  b\n\nc", 140)).toBe("a b c");
    expect(trimSpeech("abcdef", 4)).toBe("abc…");
  });
});

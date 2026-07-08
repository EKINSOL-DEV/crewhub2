import { describe, expect, it } from "vitest";
import type { TranscriptItem } from "@/ipc/bindings";
import { chatLinesFrom, mergeChatLines, type ChatLine } from "./lines";

function item(kind: TranscriptItem["kind"], data: Record<string, unknown>): TranscriptItem {
  return { kind, data } as TranscriptItem;
}

function line(over: Partial<ChatLine> & Pick<ChatLine, "seq" | "text" | "ts">): ChatLine {
  return { who: "note", ...over };
}

describe("chatLinesFrom", () => {
  it("maps UserText/AssistantText/SystemNote to their line kinds", () => {
    const items = new Map<number, TranscriptItem>([
      [1, item("UserText", { text: "hi", ts: 100 })],
      [2, item("AssistantText", { text: "hello", ts: 200 })],
      [3, item("SystemNote", { text: "note", ts: 300 })],
    ]);
    expect(chatLinesFrom(items, [1, 2, 3])).toEqual([
      { seq: 1, who: "user", text: "hi", ts: 100 },
      { seq: 2, who: "bot", text: "hello", ts: 200 },
      { seq: 3, who: "note", text: "note", ts: 300 },
    ]);
  });

  it("skips non-chat kinds (Thinking/ToolUse/ToolResult/Image/Usage/Checkpoint/Unknown)", () => {
    const items = new Map<number, TranscriptItem>([
      [1, item("Thinking", { text: "thinking", redacted: false, ts: 1 })],
      [2, item("ToolUse", { tool: "x", input_json: "{}", tool_use_id: "t1", ts: 2 })],
      [3, item("ToolResult", { tool_use_id: "t1", output_preview: "out", is_error: false, ts: 3 })],
      [4, item("Image", { media_type: "image/png", ts: 4 })],
      [5, item("Usage", { input_tokens: 1, output_tokens: 1, cache_read: 0, ts: 5 })],
      [6, item("Checkpoint", { id: "c1", ts: 6 })],
      [7, item("Unknown", { raw_type: "weird", ts: 7 })],
      [8, item("UserText", { text: "keep me", ts: 8 })],
    ]);
    expect(chatLinesFrom(items, [1, 2, 3, 4, 5, 6, 7, 8])).toEqual([
      { seq: 8, who: "user", text: "keep me", ts: 8 },
    ]);
  });

  it("flattens whitespace runs and trims", () => {
    const items = new Map<number, TranscriptItem>([
      [1, item("UserText", { text: "  a\n\n  b\tc  ", ts: 1 })],
    ]);
    expect(chatLinesFrom(items, [1])).toEqual([{ seq: 1, who: "user", text: "a b c", ts: 1 }]);
  });

  it("clamps to 600 chars with a trailing ellipsis", () => {
    const long = "x".repeat(650);
    const items = new Map<number, TranscriptItem>([[1, item("UserText", { text: long, ts: 1 })]]);
    const [line] = chatLinesFrom(items, [1]);
    expect(line?.text.length).toBe(600);
    expect(line?.text.endsWith("…")).toBe(true);
    expect(line?.text.startsWith("x".repeat(599))).toBe(true);
  });

  it("drops lines that flatten to empty", () => {
    const items = new Map<number, TranscriptItem>([[1, item("UserText", { text: "   \n\t  ", ts: 1 })]]);
    expect(chatLinesFrom(items, [1])).toEqual([]);
  });

  it("iterates in order (ascending seqs), skipping seqs missing from items", () => {
    const items = new Map<number, TranscriptItem>([
      [2, item("UserText", { text: "second", ts: 2 })],
      [1, item("UserText", { text: "first", ts: 1 })],
    ]);
    // seq 3 is in order but absent from items — skipped defensively
    expect(chatLinesFrom(items, [1, 3, 2])).toEqual([
      { seq: 1, who: "user", text: "first", ts: 1 },
      { seq: 2, who: "user", text: "second", ts: 2 },
    ]);
  });
});

describe("mergeChatLines", () => {
  it("interleaves two ts-ascending lists into one ts-ascending list", () => {
    const transcript = [line({ seq: 1, text: "t1", ts: 100 }), line({ seq: 3, text: "t3", ts: 300 })];
    const local = [line({ seq: -1, text: "l1", ts: 150 }), line({ seq: -2, text: "l2", ts: 400 })];
    expect(mergeChatLines(transcript, local).map((l) => l.text)).toEqual(["t1", "l1", "t3", "l2"]);
  });

  it("a local note between two transcript lines lands strictly between them, not after both", () => {
    const transcript = [line({ seq: 1, text: "before", ts: 500 }), line({ seq: 2, text: "after", ts: 1500 })];
    const local = [line({ seq: -1, text: "note", ts: 1000 })];
    expect(mergeChatLines(transcript, local).map((l) => l.text)).toEqual(["before", "note", "after"]);
  });

  it("breaks an exact-ts tie in the transcript line's favor", () => {
    const transcript = [line({ seq: 1, text: "transcript", ts: 1000 })];
    const local = [line({ seq: -1, text: "local", ts: 1000 })];
    expect(mergeChatLines(transcript, local).map((l) => l.text)).toEqual(["transcript", "local"]);
  });

  it("appends whichever list still has leftovers once the other is exhausted", () => {
    const transcript = [line({ seq: 1, text: "t1", ts: 100 })];
    const local = [
      line({ seq: -1, text: "l1", ts: 50 }),
      line({ seq: -2, text: "l2", ts: 200 }),
      line({ seq: -3, text: "l3", ts: 300 }),
    ];
    expect(mergeChatLines(transcript, local).map((l) => l.text)).toEqual(["l1", "t1", "l2", "l3"]);
  });

  it("passes either empty list through unchanged", () => {
    const transcript = [line({ seq: 1, text: "t1", ts: 100 })];
    const local = [line({ seq: -1, text: "l1", ts: 200 })];
    expect(mergeChatLines(transcript, [])).toEqual(transcript);
    expect(mergeChatLines([], local)).toEqual(local);
    expect(mergeChatLines([], [])).toEqual([]);
  });

  it("treats a null ts as infinitely late, sorting it after every timestamped line", () => {
    const transcript = [line({ seq: 1, text: "t1", ts: null })];
    const local = [line({ seq: -1, text: "l1", ts: 5 })];
    expect(mergeChatLines(transcript, local).map((l) => l.text)).toEqual(["l1", "t1"]);
  });
});

// The 5k probe fixture must be deterministic and shaped like a real session.
import { makePerfFixture } from "@/panels/chat/perf/fixture";
import { summarizeFrames } from "@/panels/chat/perf/PerfProbe";

test("fixture is deterministic, dense, and covers the item kinds", () => {
  const a = makePerfFixture(5000);
  const b = makePerfFixture(5000);
  expect(a.total).toBe(5000);
  expect(a.items).toHaveLength(5000);
  expect(a.items.map((i) => i.seq)).toEqual([...Array(5000).keys()]);
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));

  const kinds = new Set(a.items.map((i) => i.item.kind));
  for (const k of [
    "UserText",
    "AssistantText",
    "Thinking",
    "ToolUse",
    "ToolResult",
    "SystemNote",
    "Usage",
    "Image",
    "Checkpoint",
    "Unknown",
  ]) {
    expect(kinds.has(k as never), k).toBe(true);
  }
});

test("every fixture ToolResult pairs with a ToolUse", () => {
  const fx = makePerfFixture(1000);
  const uses = new Set(
    fx.items
      .filter((i) => i.item.kind === "ToolUse")
      .map((i) => (i.item.data as { tool_use_id: string }).tool_use_id),
  );
  for (const i of fx.items) {
    if (i.item.kind === "ToolResult") {
      expect(uses.has(i.item.data.tool_use_id)).toBe(true);
    }
  }
});

test("summarizeFrames computes percentiles after warmup", () => {
  const deltas = [...Array(30).fill(100), ...Array(95).fill(10), ...Array(5).fill(40)];
  const r = summarizeFrames(deltas);
  expect(r.frames).toBe(100);
  expect(r.p50Ms).toBe(10);
  expect(r.p95Ms).toBe(40);
  expect(r.maxMs).toBe(40);
  expect(r.approxFps).toBeGreaterThan(50);
});

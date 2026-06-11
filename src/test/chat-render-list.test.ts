// T13 (EKI-49): pure render-list mapping — pairing, folding, interleaving.
import { assistant, checkpoint, toMap, toolResult, toolUse, usage, user } from "./chat-helpers";
import {
  buildRenderList,
  formatTokens,
  interleaveSubagents,
  sumUsage,
  type RenderEntry,
  type SubagentGroup,
} from "@/panels/chat/render-list";
import { clampLines, prettyJson, toolChip, toolSummary } from "@/panels/chat/items/tool-meta";
import { humanizeId, shortId } from "@/panels/chat/humanize";

describe("buildRenderList", () => {
  test("pairs ToolResult to its ToolUse by tool_use_id and hides the result row", () => {
    const { map, order } = toMap([
      user("hi"),
      toolUse("Read", `{"file_path":"src/a.rs"}`, "tu1"),
      toolResult("tu1", "file contents"),
      assistant("done"),
    ]);
    const out = buildRenderList(map, order);
    expect(out.map((e) => e.type)).toEqual(["item", "tool", "item"]);
    const tool = out[1] as Extract<RenderEntry, { type: "tool" }>;
    expect(tool.use?.tool).toBe("Read");
    expect(tool.result?.output_preview).toBe("file contents");
  });

  test("running tool (no result yet) renders with result null", () => {
    const { map, order } = toMap([toolUse("Bash", "{}", "tu1")]);
    const tool = buildRenderList(map, order)[0] as Extract<RenderEntry, { type: "tool" }>;
    expect(tool.result).toBeNull();
  });

  test("orphan ToolResult (use outside window) still renders", () => {
    const { map, order } = toMap([toolResult("tu-gone", "out")]);
    const tool = buildRenderList(map, order)[0] as Extract<RenderEntry, { type: "tool" }>;
    expect(tool.use).toBeNull();
    expect(tool.result?.output_preview).toBe("out");
  });

  test("Usage items are folded out; Checkpoint passes through", () => {
    const { map, order } = toMap([usage(), checkpoint("c1"), user("x")]);
    const out = buildRenderList(map, order);
    expect(out).toHaveLength(2);
    expect((out[0] as Extract<RenderEntry, { type: "item" }>).item.kind).toBe("Checkpoint");
  });

  test("sparse map gaps are skipped without crashing", () => {
    const { map } = toMap([user("a")]);
    const out = buildRenderList(map, [0, 99]);
    expect(out).toHaveLength(1);
  });
});

describe("interleaveSubagents", () => {
  const entryAt = (ts: number, key: string): RenderEntry => ({
    type: "item",
    key,
    seq: ts,
    item: user("p", ts),
  });
  const group = (firstTs: number, key: string): SubagentGroup => ({
    key,
    name: "Swift Otter",
    firstTs,
    entries: [entryAt(firstTs, `${key}-e`)],
  });

  test("inserts groups by timestamp; trailing groups append", () => {
    const out = interleaveSubagents([entryAt(10, "a"), entryAt(30, "b")], [group(20, "g1"), group(99, "g2")]);
    expect(out.map((e) => e.key)).toEqual(["a", "g1", "b", "g2"]);
  });

  test("no groups → same entries", () => {
    const entries = [entryAt(1, "a")];
    expect(interleaveSubagents(entries, [])).toEqual(entries);
  });
});

describe("usage + formatting", () => {
  test("sumUsage totals all Usage items", () => {
    const { map, order } = toMap([usage(100, 10), user("x"), usage(200, 20)]);
    expect(sumUsage(map, order)).toEqual({ input_tokens: 300, output_tokens: 30, cache_read: 0 });
  });

  test("formatTokens compacts", () => {
    expect(formatTokens(999)).toBe("999");
    expect(formatTokens(12_300)).toBe("12.3k");
    expect(formatTokens(4_100)).toBe("4.1k");
    expect(formatTokens(150_000)).toBe("150k");
    expect(formatTokens(2_000_000)).toBe("2M");
    expect(formatTokens(2_500_000)).toBe("2.5M");
  });
});

describe("tool meta (Tool Chips, D-M2-6)", () => {
  test.each([
    ["Read", "📖"],
    ["Edit", "✏️"],
    ["Write", "✏️"],
    ["Bash", "💻"],
    ["Grep", "🔎"],
    ["Glob", "🔎"],
    ["WebFetch", "🌐"],
    ["mcp__crewhub__list_tasks", "🏠"],
    ["SomethingNew", "🛠️"],
  ])("%s → %s", (tool, chip) => {
    expect(toolChip(tool)).toBe(chip);
  });

  test("toolSummary picks the human field", () => {
    expect(toolSummary(`{"file_path":"src/a.rs"}`)).toBe("src/a.rs");
    expect(toolSummary(`{"command":"pnpm test"}`)).toBe("pnpm test");
    expect(toolSummary("not json")).toBe("");
    expect(toolSummary(`{"file_path":"${"x".repeat(120)}"}`)).toHaveLength(78);
  });

  test("prettyJson + clampLines", () => {
    expect(prettyJson(`{"a":1}`)).toBe(`{\n  "a": 1\n}`);
    expect(prettyJson("broken{")).toBe("broken{");
    expect(clampLines("a\nb\nc", 2)).toEqual({ text: "a\nb", clamped: true });
    expect(clampLines("a\nb", 5)).toEqual({ text: "a\nb", clamped: false });
  });
});

describe("humanize", () => {
  test("deterministic friendly names, never raw uuids", () => {
    const a = humanizeId("abc-123");
    expect(humanizeId("abc-123")).toBe(a);
    expect(a).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    expect(humanizeId("def-456")).not.toBe(""); // different ids may rarely collide; only shape is pinned
    expect(shortId("abcd1234-feed-beef")).toBe("abcd1234");
  });
});

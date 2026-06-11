// Deterministic synthetic transcript for the 60fps/5k probe (D-M2-4).
import type { SeqItem, TranscriptItem, TranscriptPage } from "@/ipc/bindings";

const CODE = `function fib(n: number): number {
  if (n < 2) return n;
  return fib(n - 1) + fib(n - 2);
}
console.log(fib(30));`;

const LOREM = "The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. ";

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export function makePerfFixture(count = 5000, seed = 42): TranscriptPage {
  const rnd = lcg(seed);
  const items: SeqItem[] = [];
  let toolN = 0;
  let ts = 1_700_000_000_000;

  const push = (item: TranscriptItem) => {
    items.push({ seq: items.length, item });
    ts += 800 + Math.floor(rnd() * 4000);
  };

  while (items.length < count) {
    const r = rnd();
    if (r < 0.18) {
      push({
        kind: "UserText",
        data: {
          text: `**Task ${items.length}**: ${LOREM.repeat(1 + Math.floor(rnd() * 2))}\n- step one\n- step two`,
          ts,
        },
      });
    } else if (r < 0.45) {
      const code = rnd() < 0.4 ? `\n\n\`\`\`ts\n${CODE}\n\`\`\`\n` : "";
      push({
        kind: "AssistantText",
        data: {
          text: `Here is what I found about item ${items.length}.\n\n${LOREM.repeat(1 + Math.floor(rnd() * 4))}${code}`,
          ts,
        },
      });
    } else if (r < 0.55) {
      const long = rnd() < 0.3;
      push({ kind: "Thinking", data: { text: LOREM.repeat(long ? 12 : 3), redacted: rnd() < 0.1, ts } });
    } else if (r < 0.8 && items.length + 1 < count) {
      const id = `tu-${toolN++}`;
      push({
        kind: "ToolUse",
        data: {
          tool: rnd() < 0.5 ? "Read" : "Bash",
          input_json: JSON.stringify({ file_path: `src/module_${items.length}.rs`, command: "cargo check" }),
          tool_use_id: id,
          ts,
        },
      });
      push({
        kind: "ToolResult",
        data: {
          tool_use_id: id,
          output_preview: LOREM.repeat(2 + Math.floor(rnd() * 3)),
          is_error: rnd() < 0.07,
          ts,
        },
      });
    } else if (r < 0.86) {
      push({ kind: "SystemNote", data: { text: `system: housekeeping note ${items.length}`, ts } });
    } else if (r < 0.9) {
      push({
        kind: "Usage",
        data: {
          input_tokens: 1000 + Math.floor(rnd() * 9000),
          output_tokens: 200 + Math.floor(rnd() * 2000),
          cache_read: Math.floor(rnd() * 50_000),
          ts,
        },
      });
    } else if (r < 0.94) {
      push({ kind: "Image", data: { media_type: "image/png", ts } });
    } else if (r < 0.97) {
      push({ kind: "Checkpoint", data: { id: `ckpt-${items.length}`, ts } });
    } else {
      push({ kind: "Unknown", data: { raw_type: "future-item", ts } });
    }
  }

  return { items, total: items.length };
}

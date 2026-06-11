// Shared jsdom shims + fixtures for chat-panel tests. Import this FIRST in
// every chat test file: jsdom lacks ResizeObserver/scrollTo, which TanStack
// Virtual and the stick-to-bottom logic touch.
import type { SessionId, TranscriptItem } from "@/ipc/bindings";

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  (globalThis as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver;
}

if (typeof Element.prototype.scrollTo !== "function") {
  Element.prototype.scrollTo = function scrollTo(this: Element, options?: ScrollToOptions | number) {
    if (typeof options === "object" && options?.top !== undefined) this.scrollTop = options.top;
  } as typeof Element.prototype.scrollTo;
}

// jsdom has no layout: TanStack Virtual reads offsetWidth/offsetHeight (both
// always 0 in jsdom), which would collapse every row. Fixed 60px boxes (and an
// 800x600 scroll viewport) keep the virtualizer honest in component tests.
export const TEST_ROW_HEIGHT = 60;
Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
  configurable: true,
  get(this: HTMLElement) {
    return this.dataset.testid === "virtual-transcript" ? 600 : TEST_ROW_HEIGHT;
  },
});
Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
  configurable: true,
  get() {
    return 800;
  },
});

/** Mock matchMedia with a fixed prefers-reduced-motion answer. */
export function mockReducedMotion(reduce: boolean): void {
  window.matchMedia = ((query: string) =>
    ({
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }) as MediaQueryList) as typeof window.matchMedia;
}

export const TEST_SID: SessionId = { provider: "claude-code", id: "abcd1234-feed-beef-0000-000000000001" };

export function user(text: string, ts = 1): TranscriptItem {
  return { kind: "UserText", data: { text, ts } };
}
export function assistant(text: string, ts = 2): TranscriptItem {
  return { kind: "AssistantText", data: { text, ts } };
}
export function thinking(text: string | null, redacted = false, ts = 3): TranscriptItem {
  return { kind: "Thinking", data: { text, redacted, ts } };
}
export function toolUse(tool: string, inputJson: string, id: string, ts = 4): TranscriptItem {
  return { kind: "ToolUse", data: { tool, input_json: inputJson, tool_use_id: id, ts } };
}
export function toolResult(id: string, output: string, isError = false, ts = 5): TranscriptItem {
  return { kind: "ToolResult", data: { tool_use_id: id, output_preview: output, is_error: isError, ts } };
}
export function usage(input = 100, output = 50, ts = 6): TranscriptItem {
  return { kind: "Usage", data: { input_tokens: input, output_tokens: output, cache_read: 0, ts } };
}
export function checkpoint(id: string, ts = 7): TranscriptItem {
  return { kind: "Checkpoint", data: { id, ts } };
}

export function toMap(items: TranscriptItem[]): { map: Map<number, TranscriptItem>; order: number[] } {
  const map = new Map<number, TranscriptItem>();
  const order: number[] = [];
  items.forEach((it, i) => {
    map.set(i, it);
    order.push(i);
  });
  return { map, order };
}

// T13 (EKI-49): one renderer per TranscriptItem kind (D-M2-5 table).
import "./chat-helpers";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TranscriptItem } from "@/ipc/bindings";
import { ITEM_RENDERERS } from "@/panels/chat/items";
import { ThinkingBlock, THINKING_COLLAPSE_CHARS } from "@/panels/chat/items/ThinkingBlock";
import { ToolCallCard } from "@/panels/chat/items/ToolCallCard";
import { ImageItem, SystemRow, UnknownRow } from "@/panels/chat/items/Rows";
import { AssistantBubble, UserBubble } from "@/panels/chat/items/Bubbles";
import { mockReducedMotion, thinking, toolResult, toolUse } from "./chat-helpers";

beforeEach(() => mockReducedMotion(false));

test("ITEM_RENDERERS covers every TranscriptItem kind (Usage folds away)", () => {
  const kinds: Array<TranscriptItem["kind"]> = [
    "UserText",
    "AssistantText",
    "Thinking",
    "ToolUse",
    "ToolResult",
    "Image",
    "SystemNote",
    "Usage",
    "Checkpoint",
    "Unknown",
  ];
  for (const kind of kinds) {
    expect(kind in ITEM_RENDERERS, kind).toBe(true);
    if (kind !== "Usage") expect(ITEM_RENDERERS[kind], kind).toBeTruthy();
  }
});

test("UserBubble renders markdown right-aligned", () => {
  render(<UserBubble seq={0} item={{ kind: "UserText", data: { text: "**bold** move", ts: 1 } }} />);
  expect(screen.getByTestId("user-bubble")).toHaveClass("justify-end");
  expect(screen.getByText("bold")).toBeInTheDocument();
});

test("AssistantBubble renders markdown", () => {
  render(
    <AssistantBubble seq={0} item={{ kind: "AssistantText", data: { text: "# Title\nbody", ts: 1 } }} />,
  );
  expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument();
});

describe("ThinkingBlock", () => {
  test("short thinking renders in full, no toggle", () => {
    render(<ThinkingBlock seq={0} item={thinking("short thought")} />);
    expect(screen.getByText("short thought")).toBeInTheDocument();
    expect(screen.queryByTestId("thinking-toggle")).not.toBeInTheDocument();
  });

  test("collapses beyond 500 chars and expands on click", async () => {
    const long = "x".repeat(THINKING_COLLAPSE_CHARS + 100);
    render(<ThinkingBlock seq={0} item={thinking(long)} />);
    const block = screen.getByTestId("thinking-block");
    expect(block.textContent).not.toContain(long);
    await userEvent.click(screen.getByTestId("thinking-toggle"));
    expect(block.textContent).toContain(long);
  });

  test("redacted ⇒ private placeholder", () => {
    render(<ThinkingBlock seq={0} item={thinking(null, true)} />);
    expect(screen.getByTestId("thinking-redacted")).toHaveTextContent("🔒 thinking privately…");
  });
});

describe("ToolCallCard", () => {
  const use = toolUse("Read", `{"file_path":"src/a.rs"}`, "tu1");
  const useData = use.kind === "ToolUse" ? use.data : null;

  test("chip + summary + running status; input folds open on click", async () => {
    render(<ToolCallCard use={useData} result={null} />);
    expect(screen.getByTestId("tool-card-header")).toHaveTextContent("📖");
    expect(screen.getByTestId("tool-card-header")).toHaveTextContent("src/a.rs");
    expect(screen.getByTestId("tool-card-status")).toHaveTextContent("⏳");
    expect(screen.queryByTestId("tool-card-body")).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId("tool-card-header"));
    expect(screen.getByTestId("tool-card-body")).toHaveTextContent('"file_path"');
  });

  test("error result ⇒ red edge + error label", async () => {
    const res = toolResult("tu1", "boom", true);
    render(<ToolCallCard use={useData} result={res.kind === "ToolResult" ? res.data : null} />);
    expect(screen.getByTestId("tool-card")).toHaveAttribute("data-error");
    expect(screen.getByTestId("tool-card-status")).toHaveTextContent("❌");
    await userEvent.click(screen.getByTestId("tool-card-header"));
    expect(screen.getByTestId("tool-card-output")).toHaveTextContent("boom");
  });

  test("orphan result renders without a use", () => {
    const res = toolResult("gone", "output text");
    render(<ToolCallCard use={null} result={res.kind === "ToolResult" ? res.data : null} />);
    expect(screen.getByTestId("tool-card-status")).toHaveTextContent("✅");
  });
});

test("SystemRow renders a dim single line", () => {
  render(<SystemRow seq={0} item={{ kind: "SystemNote", data: { text: "compacted", ts: 1 } }} />);
  expect(screen.getByTestId("system-row")).toHaveTextContent("compacted");
});

test("UnknownRow never crashes and names the raw type", () => {
  render(<UnknownRow seq={0} item={{ kind: "Unknown", data: { raw_type: "weird-v9", ts: 1 } }} />);
  expect(screen.getByTestId("unknown-row")).toHaveTextContent("🤷 unsupported item (weird-v9)");
});

test("ImageItem renders the media-type placeholder (G8: no bytes in M2)", () => {
  render(<ImageItem seq={0} item={{ kind: "Image", data: { media_type: "image/png", ts: 1 } }} />);
  expect(screen.getByTestId("image-item")).toHaveTextContent("image/png");
});

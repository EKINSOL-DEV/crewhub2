// The renderer mapping (EKI-49 core, D-M2-5): every TranscriptItem kind maps
// to exactly one renderer. Usage folds into the meta strip and is never
// rendered inline (buildRenderList drops it before this table is consulted).
import type { TranscriptItem } from "@/ipc/bindings";
import { AssistantBubble, UserBubble } from "./Bubbles";
import { CheckpointMarker, ImageItem, SystemRow, UnknownRow } from "./Rows";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolUseEntry, ToolResultEntry } from "./tool-entries";
import type { ItemProps } from "./types";

export const ITEM_RENDERERS: Record<TranscriptItem["kind"], React.ComponentType<ItemProps>> = {
  UserText: UserBubble, //          right-aligned, markdown
  AssistantText: AssistantBubble, // markdown + code blocks (shiki)
  Thinking: ThinkingBlock, //       collapsed >500 chars; redacted ⇒ "🔒 thinking privately…"
  ToolUse: ToolUseEntry, //         foldable input, per-tool emoji chip (D-M2-6)
  ToolResult: ToolResultEntry, //   joined to its ToolUse by tool_use_id; error ⇒ red edge
  Image: ImageItem, //              media_type placeholder (M2 — §2 gap G8)
  SystemNote: SystemRow, //         dim single line
  Usage: null as never, //          folded into the session meta strip, not rendered inline
  Checkpoint: CheckpointMarker, //  "📍 checkpoint" + rewind (EKI-64)
  Unknown: UnknownRow, //           "🤷 unsupported item (raw_type)" — never crash (M1 contract)
};

export type { ItemProps };

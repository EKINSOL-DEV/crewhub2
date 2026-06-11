import type { TranscriptItem } from "@/ipc/bindings";
import type { ToolResultData } from "../render-list";

export interface ItemProps {
  seq: number;
  item: TranscriptItem;
  /** Joined ToolResult, only meaningful for ToolUse items (D-M2-5). */
  result?: ToolResultData | null;
}

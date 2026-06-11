import { Markdown } from "@/components/Markdown";
import type { ItemProps } from "./types";

/** Right-aligned user message, markdown-rendered (D-M2-5). */
export function UserBubble({ item }: ItemProps) {
  if (item.kind !== "UserText") return null;
  return (
    <div className="flex justify-end px-3 py-1.5" data-testid="user-bubble">
      <div className="max-w-[85%] rounded-2xl rounded-br-sm border border-border bg-accent/15 px-3 py-2">
        <Markdown text={item.data.text} />
      </div>
    </div>
  );
}

/** Assistant message: markdown + shiki code blocks (D-M2-5). */
export function AssistantBubble({ item }: ItemProps) {
  if (item.kind !== "AssistantText") return null;
  return (
    <div className="px-3 py-1.5" data-testid="assistant-bubble">
      <div className="max-w-[92%]">
        <Markdown text={item.data.text} />
      </div>
    </div>
  );
}

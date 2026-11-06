// Source: crewhub-loops apps/web/src/components/primitives/sendChord.ts @ c7f9d679. Copied verbatim; do not edit here, change the source and re-copy.
/* The "send" chord of a message box (CL-181): Ctrl+Enter, or Cmd+Enter on a Mac. Plain Enter, Shift+Enter and Alt+Enter keep their
   meaning (a new line). An IME that confirms a composition with Enter (isComposing, or the legacy keyCode 229) never sends. One rule for
   the chat, the quick ask and the comment composer. */
export interface ChordEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  keyCode?: number;
  isComposing?: boolean;
  nativeEvent?: { isComposing?: boolean; keyCode?: number };
}

export function isSendChord(e: ChordEvent): boolean {
  if (e.key !== "Enter" || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return false;
  const composing = e.isComposing ?? e.nativeEvent?.isComposing;
  const code = e.keyCode ?? e.nativeEvent?.keyCode;
  return !composing && code !== 229;
}

/* The "send" chord of a message box, loops' CL-181 (crewhub-loops c7f9d679), ported for the copied chat dock (round 69, w5-10):
   Ctrl+Enter, or Cmd+Enter on a Mac. Plain Enter, Shift+Enter and Alt+Enter keep their meaning (a new line). An IME that confirms
   a composition with Enter (isComposing, or the legacy keyCode 229) never sends. */
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

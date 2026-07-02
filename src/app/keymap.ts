// Keyboard map (Appendix A — ported v1 zen map). Pure matcher, no DOM.
// `mod` is ⌘ on macOS / Ctrl elsewhere; callers pass metaKey || ctrlKey.
import type { SplitDir } from "./layout-tree";

export type KeyAction =
  | { type: "palette" }
  | { type: "newTab" }
  | { type: "closeTab" }
  | { type: "focusPanel"; index: number }
  | { type: "cycleFocus"; dir: 1 | -1 }
  | { type: "split"; dir: SplitDir }
  | { type: "closePanel" }
  | { type: "maximize" }
  | { type: "resize"; axis: SplitDir; delta: number }
  | { type: "help" }
  | { type: "escape" };

export interface KeyStroke {
  key: string;
  mod: boolean; // metaKey || ctrlKey
  shift: boolean;
  alt: boolean;
  inEditable: boolean; // target is input/textarea/contenteditable
}

const RESIZE_STEP = 0.05;

/** Match a keystroke against the workspace keymap. Returns null when unhandled. */
export function matchKey(s: KeyStroke): KeyAction | null {
  const key = s.key.length === 1 ? s.key.toLowerCase() : s.key;

  if (key === "Escape" && !s.mod && !s.shift && !s.alt) return { type: "escape" };

  if (key === "Tab" && !s.mod && !s.alt) {
    if (s.inEditable) return null; // never steal Tab from text inputs (v1 lesson)
    return { type: "cycleFocus", dir: s.shift ? -1 : 1 };
  }

  if (!s.mod || s.alt) return null;

  // ⌘⇧\ produces "|" on many layouts — treat both as the shifted split.
  if (key === "\\" || key === "|") return { type: "split", dir: s.shift || key === "|" ? "col" : "row" };

  if (s.shift) {
    switch (key) {
      case "w":
        return { type: "closePanel" };
      case "m":
        return { type: "maximize" };
      case "ArrowLeft":
        return { type: "resize", axis: "row", delta: -RESIZE_STEP };
      case "ArrowRight":
        return { type: "resize", axis: "row", delta: RESIZE_STEP };
      case "ArrowUp":
        return { type: "resize", axis: "col", delta: -RESIZE_STEP };
      case "ArrowDown":
        return { type: "resize", axis: "col", delta: RESIZE_STEP };
      default:
        return null;
    }
  }

  if (key === "k") return { type: "palette" };
  if (key === "t") return { type: "newTab" };
  if (key === "w") return { type: "closeTab" };
  if (key === "/") return { type: "help" };
  if (/^[1-9]$/.test(key)) return { type: "focusPanel", index: Number(key) };

  return null;
}

// ── Top-level view switching (world-primary shell) ───────────────────────────
// ⌘1 = world, ⌘2 = workspace. Matched at the App level in the CAPTURE phase,
// but only when it actually changes the view — so inside the workspace, ⌘2
// (and ⌘3…9) still fall through to focusPanel. Only ⌘1-as-focus is sacrificed.

/** Registry-generated rows for the ⌘/ shortcut help sheet. */
export const KEYMAP_HELP: ReadonlyArray<{ keys: string; action: string }> = [
  { keys: "⌘K", action: "Command palette" },
  { keys: "⌘T / ⌘W", action: "New workspace tab / close tab" },
  { keys: "⌘2…9", action: "Focus panel N (visual order)" },
  { keys: "Tab / ⇧Tab", action: "Cycle panel focus (outside inputs)" },
  { keys: "⌘\\ / ⌘⇧\\", action: "Split focused panel horizontal / vertical" },
  { keys: "⌘⇧W", action: "Close focused panel" },
  { keys: "⌘⇧M", action: "Maximize / restore focused panel" },
  { keys: "⌘⇧ + arrows", action: "Resize focused split" },
  { keys: "⌘/", action: "This help sheet" },
  { keys: "Esc", action: "Restore maximize / close overlay" },
];

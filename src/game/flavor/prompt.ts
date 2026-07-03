// Flavor prompt + sanitizer (M4 T1): pure text shaping for the throttled
// Haiku "thought" runs — no store, no IPC, easy to test in isolation.
import type { SessionStatus } from "@/ipc/bindings";

/** Wrapping pairs a model likes to answer in, stripped outermost-first. */
const WRAPPERS: [string, string][] = [
  ["```", "```"],
  ["**", "**"],
  ['"', '"'],
  ["'", "'"],
  ["`", "`"],
  ["*", "*"],
];

function stripWrappers(text: string): string {
  let s = text;
  let changed = true;
  while (changed) {
    changed = false;
    for (const [open, close] of WRAPPERS) {
      if (s.length > open.length + close.length && s.startsWith(open) && s.endsWith(close)) {
        s = s.slice(open.length, s.length - close.length).trim();
        changed = true;
        break;
      }
    }
  }
  return s;
}

/** Clamp caps — token cost discipline, not display truncation: a runaway
 * session/activity name shouldn't blow up the (already cheap) Haiku prompt. */
const MAX_NAME_LEN = 60;
const MAX_ACTIVITY_LEN = 200;

function clamp(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

/** Instruction for one cheap headless run — kept short, the model is Haiku. */
export function flavorPrompt(c: { name: string; status: SessionStatus; activity: string | null }): string {
  const name = clamp(c.name, MAX_NAME_LEN);
  const topic = clamp(c.activity ?? c.status, MAX_ACTIVITY_LEN);
  return `You are ${name}, a robot working on a software campus. Reply with ONE playful thought (<=12 words) about: ${topic}. No quotes.`;
}

/**
 * Shapes a raw model reply into a bubble-ready line: trim → strip wrapping
 * quotes/backticks/markdown → first non-empty line → clamp to 90 chars.
 * Returns null for empty or error-ish replies (silently dropped upstream).
 */
export function sanitizeThought(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const stripped = stripWrappers(trimmed);
  let line = "";
  for (const raw of stripped.split(/\r?\n/)) {
    const candidate = raw.trim();
    if (candidate) {
      line = candidate;
      break;
    }
  }
  if (!line) return null;
  if (/^error[:\s]/i.test(line)) return null;

  return line.length > 90 ? line.slice(0, 90).trimEnd() : line;
}

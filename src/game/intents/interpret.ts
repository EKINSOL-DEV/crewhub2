// Haiku fallback intent interpreter (M7 T1): when parseIntent (see parse.ts)
// finds no deterministic command, this asks a cheap headless model to decide
// whether the message was a command anyway — same worldGenerateProp call and
// throttle-adjacent shape as src/game/flavor/engine.ts's maybeThink, but this
// is user-triggered (one message in, one intent out) rather than time-driven.
//
// Everything except interpretIntent itself is pure: buildInterpretPrompt and
// parseInterpretReply take no clock, no randomness, and can be fuzzed with
// plain strings in tests.
import { commands } from "@/ipc/bindings";
import { flavorEnabled, flavorModel, bumpFlavorRuns } from "@/game/flavor/engine";
import { EMOTE_NAMES, resolveRoom, type EmoteName, type Intent, type IntentContext } from "./parse";

const MAX_CATALOG = 24;
const MAX_NAME_LEN = 40;
const MAX_SAY_LEN = 200;

function clampName(name: string): string {
  return name.length > MAX_NAME_LEN ? name.slice(0, MAX_NAME_LEN) : name;
}

/**
 * Strict, minified-JSON-only instruction. Deterministic for a given
 * (text, ctx) pair — no timestamps, no randomness — and the room catalog is
 * clamped so a huge project list can't blow up the (cheap) Haiku prompt.
 */
export function buildInterpretPrompt(text: string, ctx: IntentContext): string {
  const roomNames = ctx.rooms.slice(0, MAX_CATALOG).map((r) => clampName(r.name));
  const targets = ["hq", "plaza", ...roomNames];
  return [
    "You are a strict command interpreter for a small office-world game.",
    `The user said: ${JSON.stringify(text)}`,
    "Decide what they want, then reply with ONLY minified JSON — no prose, no markdown fences — matching exactly one shape:",
    `{"action":"goto","target":"<one of: ${targets.map((t) => JSON.stringify(t)).join(",")}>"}`,
    `{"action":"emote","emote":<one of: ${EMOTE_NAMES.map((e) => JSON.stringify(e)).join(",")}>}`,
    `{"action":"say","text":"<a short reply, at most ${MAX_SAY_LEN} characters>"}`,
    '{"action":"none"}',
    "If nothing above fits, reply with the none action. Never invent a target outside the list.",
  ].join(" ");
}

/** Tolerant fence/prose stripping: pulls the first balanced {...} block out of whatever the model said. */
function extractJson(raw: string): string | null {
  let s = raw.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(s)?.[1];
  if (fenced) s = fenced.trim();
  if (!s.startsWith("{")) {
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    s = s.slice(start, end + 1);
  }
  return s;
}

/** flavor/prompt.ts's sanitizeThought, but for a 200-char "say" line instead of a 90-char thought. */
function sanitizeSayText(text: string): string | null {
  let s = text.trim();
  if (!s) return null;
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  s = (s.split(/\r?\n/)[0] ?? "").trim();
  if (!s) return null;
  if (/^error[:\s]/i.test(s)) return null;
  return s.length > MAX_SAY_LEN ? s.slice(0, MAX_SAY_LEN).trimEnd() : s;
}

/**
 * Validates a raw model reply against the catalog/emote union. Anything
 * that isn't recognizable as one of the four action shapes — including the
 * explicit "none" action — resolves to null.
 */
export function parseInterpretReply(raw: string, ctx: IntentContext): Intent | null {
  const jsonText = extractJson(raw);
  if (!jsonText) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;

  switch (obj.action) {
    case "goto": {
      if (typeof obj.target !== "string") return null;
      const target = obj.target.trim();
      const lower = target.toLowerCase();
      if (lower === "hq") return { kind: "goto", target: { type: "hq" } };
      if (lower === "plaza") return { kind: "goto", target: { type: "plaza" } };
      const buildingKey = resolveRoom(target, ctx.rooms);
      return buildingKey ? { kind: "goto", target: { type: "room", buildingKey } } : null;
    }
    case "emote": {
      if (typeof obj.emote !== "string") return null;
      const emote = obj.emote.trim().toLowerCase();
      return (EMOTE_NAMES as readonly string[]).includes(emote)
        ? { kind: "emote", emote: emote as EmoteName }
        : null;
    }
    case "say": {
      if (typeof obj.text !== "string") return null;
      const text = sanitizeSayText(obj.text);
      return text ? { kind: "say", text } : null;
    }
    default:
      return null;
  }
}

// Module-level in-flight guard mirrors flavor/engine.ts's `inFlight` — one
// interpretation at a time; a message that arrives mid-run is dropped
// silently rather than queued (the caller re-asks if it still matters).
let inFlight = false;

/**
 * Full round trip: prompt -> Haiku (via worldGenerateProp) -> validated
 * Intent. Silent null on any failure (disabled, in-flight, IPC error, model
 * declined/garbled) — this is a best-effort fallback, never something a
 * caller should surface as an error. Bumps the shared flavor run counter,
 * but only when interpretation actually produced an intent.
 */
export async function interpretIntent(text: string, ctx: IntentContext): Promise<Intent | null> {
  if (!flavorEnabled()) return null;
  if (inFlight) return null;

  inFlight = true;
  try {
    const res = await commands.worldGenerateProp(buildInterpretPrompt(text, ctx), flavorModel());
    if (res.status !== "ok" || res.data.status !== "success") return null;
    const intent = parseInterpretReply(res.data.text, ctx);
    if (intent) bumpFlavorRuns();
    return intent;
  } catch {
    return null;
  } finally {
    inFlight = false;
  }
}

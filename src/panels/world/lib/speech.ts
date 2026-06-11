// Speech-bubble fold (EKI-66): pure helpers; the subscription lives in
// use-speech-bubbles.ts. A bot speaks its newest AssistantText briefly.
import { sessionKey } from "@/stores/sessions";
import type { SessionEvent } from "@/ipc/bindings";

export const SPEECH_TTL_MS = 6000;
export const SPEECH_MAX_CHARS = 140;

export interface SpeechEntry {
  text: string;
  /** Wall-clock ms when the bubble appeared. */
  ts: number;
}

export type SpeechMap = Record<string, SpeechEntry>;

/** Collapse whitespace; hard-cut at `max` with an ellipsis. */
export function trimSpeech(text: string, max: number = SPEECH_MAX_CHARS): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** New bubble for an AssistantText Item event; null for everything else. */
export function speechFromEvent(ev: SessionEvent, now: number): { key: string; entry: SpeechEntry } | null {
  if (ev.type !== "Item" || ev.data.item.kind !== "AssistantText") return null;
  const text = trimSpeech(ev.data.item.data.text);
  if (!text) return null;
  return { key: sessionKey(ev.data.id), entry: { text, ts: now } };
}

/** Drop expired bubbles. Returns the same reference when nothing changed. */
export function pruneSpeech(map: SpeechMap, now: number): SpeechMap {
  const keys = Object.keys(map);
  const live = keys.filter((k) => now - map[k]!.ts <= SPEECH_TTL_MS);
  if (live.length === keys.length) return map;
  const next: SpeechMap = {};
  for (const k of live) next[k] = map[k]!;
  return next;
}

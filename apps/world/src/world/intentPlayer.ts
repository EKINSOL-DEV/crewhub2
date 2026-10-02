/* The seam where accepted director intents become something the world shows. `playIntent` records the intent for the
   text view ("director: cr-dev-1 goes to the coffee machine in the lobby") and hands it to the players: the scene routes it through the walk runtime (walks.ts), which walks it
   only inside the entered building and never under reduced motion. The log says what was played either way. */
import { describeIntent, type Intent, type WorldModel } from "@crewhub/world-model";

export interface PlayedIntent {
  id: number;
  intent: Intent;
  /** The text-view sentence, prefixed "director:". */
  text: string;
  /** Demo time the intent was played and when it lapses. */
  at: number;
  expiresAt: number;
}

const LOG_LIMIT = 40;
let nextId = 1;
let log: readonly PlayedIntent[] = [];
const listeners = new Set<() => void>();
/** Players get every played intent, and null when the kill switch clears them all. */
const players = new Set<(played: PlayedIntent | null) => void>();

const emit = () => listeners.forEach((listener) => listener());

export function playIntent(intent: Intent, model: WorldModel): PlayedIntent {
  const played: PlayedIntent = { id: nextId++, intent, text: `director: ${describeIntent(model, intent)}`, at: model.now, expiresAt: model.now + intent.ttlMs };
  log = [played, ...log].slice(0, LOG_LIMIT);
  emit();
  for (const player of players) player(played);
  return played;
}

/** The kill switch: every line of the log goes at once, and the players are told. */
export function clearIntents(): void {
  log = [];
  emit();
  for (const player of players) player(null);
}

/** Subscribes a player (the scene's walks) to played intents; null means every intent was cleared. */
export function onPlayIntent(player: (played: PlayedIntent | null) => void): () => void {
  players.add(player);
  return () => players.delete(player);
}

export const playedIntents = (): readonly PlayedIntent[] => log;

export function subscribeIntents(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

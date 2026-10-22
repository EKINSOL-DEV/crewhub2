/* A read-only probe for the long-session tools (round 27, `tools/memory.mjs live`): the sizes of the page's own stores
   (the bubbles, the Recent answers, the chat threads), the town document's revision and the host's revision this page
   is on, the host's stream state as this page last read it, and the page's own connection state, on
   `window.__worldStores`. Pure: the reads come in (state/soakPage.ts has the page's), nothing is kept, and nothing of
   the world reads the probe. */

export interface WorldStores {
  /** Bubbles alive right now (`said.ts`, swept as they expire). */
  said: number;
  /** The Recent answers list (at most `RECENT_ANSWERS`). */
  answers: number;
  /** Chat threads remembered for the card; null before the first read (a demo page). */
  threads: number | null;
  /** The town document's revision in this page, and the host's revision this page is on (null off the host). */
  docRevision: number;
  hostRev: number | null;
  /** The host's stream as this page last read its health: its state and how often it reconnected upstream. */
  stream: { state: string; reconnects: number } | null;
  /** The page's own connection to the host (`loops-client`), whatever its state object holds, for the record. */
  connection: unknown;
}

/** The getters the probe reads through: the stores' own, and the page's connection where the world has one. */
export interface StoreReads {
  said: () => number;
  answers: () => number;
  threads: () => ReadonlyMap<string, unknown> | null;
  town: () => { docRevision: number; hostRev: number | null };
  stream: () => { state: string; reconnects: number } | null;
  connection: () => unknown;
}

/** What the probe answers for `reads`: every size read fresh, nothing kept. */
export function worldStores(reads: StoreReads): WorldStores {
  const threads = reads.threads();
  const town = reads.town();
  return { said: reads.said(), answers: reads.answers(), threads: threads ? threads.size : null, docRevision: town.docRevision, hostRev: town.hostRev, stream: reads.stream(), connection: reads.connection() };
}

/** Where the probe goes: the window, or a stand-in in a test. */
export interface ProbeTarget {
  __worldStores?: (() => WorldStores) | undefined;
}

/** Puts the probe on `target` (the window): `__worldStores()` answers the sizes of the moment. */
export function installSoakProbe(reads: StoreReads, target: ProbeTarget = window as unknown as ProbeTarget): void {
  target.__worldStores = () => worldStores(reads);
}

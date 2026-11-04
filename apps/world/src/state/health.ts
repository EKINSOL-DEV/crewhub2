/* The host's health in the page, one module (round 59d, C6). Every read of `/world-api/health` the page makes goes
   through here, and every place that shows the host's word reads the one value it keeps.

   The interface:
   - a caller declares a freshness **need** while it shows something that must stay fresh: a Connect screen (`screen`,
     every 2.5 s), the Connection panel (`panel`, every 5 s, and at once when the stream's state changes), the first
     snapshot loading (`snapshot`, every 0.5 s), or a glance (`glance`: the text view or the Chat panel opening, one read).
     A need asks at once; while any is held, the host is asked at the fastest held need's pace, one read in flight at a
     time (an ask during a read is one more read after it, never two at once and never an older answer over a newer);
   - the page tells it the **stream's word** (the live source's state and the host's key word on its status messages).
     From that word it reads again by itself when the stream goes live or the key word changes (the chat road's
     re-read, round 29), and while a host from before round 11 leaves the key unsaid under `unauthorized` or `loops-down`
     with no screen yet, it polls as a screen would (the degraded case, round 48);
   - it hands out one **value**: the health as last answered (the gate's read until the first answer; never replaced by a
     silence), the last read (its answer, or null when the host did not answer), and two derivations: the screen that
     stands in for a running town (`screenOver`, from the stream's word over the health) and the first snapshot's
     progress (the last read's `connection.snapshot`, null when it went unanswered).

   The core (`createHostHealth`) takes the probe and the clock, so its tests drive it with a fake probe and a fake
   schedule. The page's instance (`pageHealth`) asks the real host and starts with the gate's read (state/source.ts). It
   does not import state/world.ts: the gate (main.tsx) uses it before the world's module loads. ADR 0005 unchanged. */
import { useEffect, useState, useSyncExternalStore } from "react";
import { probeHost, type ConnectionState, type HostHealth, type HostKeyState, type HostSnapshotState } from "@crewhub/loops-client";
import { liveScreen, withStreamKey, type ConnectScreen } from "./connect.ts";
import { sourceDecision } from "./source.ts";

/** What a caller shows that needs the host's health fresh. */
export type HealthNeed = "screen" | "panel" | "snapshot" | "glance";

/** How often each need asks; null asks once, when the need begins. A Connect screen's pace is also the degraded poll's. */
export const HEALTH_POLL_MS: Readonly<Record<HealthNeed, number | null>> = { screen: 2500, panel: 5000, snapshot: 500, glance: null };

/** How long one read waits for the host. */
export const HEALTH_TIMEOUT_MS = 1500;

/** The live source's word: its state, and the host's key word on its status messages (null where the host says none). */
export interface StreamWord {
  connection: ConnectionState | null;
  key: HostKeyState["state"] | null;
}

/** One read: when it landed, and the host's answer (null: the host did not answer). `seq` counts reads, from 1. */
export interface HealthRead {
  seq: number;
  at: number;
  health: HostHealth | null;
}

export interface HealthView {
  /** The health as last answered; the gate's read until the first answer; null when nothing was ever answered. */
  health: HostHealth | null;
  /** The last read, answered or not; null before the first. */
  read: HealthRead | null;
}

export interface HostHealthOptions {
  /** One read of the host's health: its answer, or null when nothing (or not a host) answered. */
  probe: () => Promise<HostHealth | null>;
  /** The health known before the first read (the gate's). */
  initial: HostHealth | null;
  now?: () => number;
  /** Runs `fn` once after `ms`; answers a cancel. */
  schedule?: (fn: () => void, ms: number) => () => void;
}

export interface HostHealthModule {
  view(): HealthView;
  subscribe(listener: () => void): () => void;
  /** Holds a need until the returned release is called. */
  need(kind: HealthNeed): () => void;
  /** The stream's word, each time it changes; null when there is no live stream (a demo page). */
  stream(word: StreamWord | null): void;
  /** One read now (a key was sent or forgotten): after the read in flight, if there is one. */
  ask(): void;
  /** Stops every timer; reads in flight are dropped. */
  dispose(): void;
}

/** What a screen shows before the host has answered once (a page forced live with a silent host): no connection known. */
export const BLANK_HEALTH: HostHealth = { loops: "ok", keyName: "", sharedKey: false, pairing: "on", paired: false };

/**
 * The screen that stands in for a running town (state/connect.ts `liveScreen`), from the stream's word over the health:
 * the stream's key word is fresher than any read (after a Forget in another tab it says `none` at once).
 */
export function screenOver(health: HostHealth | null, word: StreamWord): ConnectScreen | null {
  return liveScreen(word.connection, withStreamKey(health ?? BLANK_HEALTH, word.key));
}

/** The first snapshot's progress: the read's `connection.snapshot`, null when it went unanswered or there was none. */
export function snapshotProgress(read: HealthRead | null): HostSnapshotState | null {
  return read?.health?.connection?.snapshot ?? null;
}

/**
 * When the stream's word asks for a read (round 29, Medium 2): a value that changes when the stream goes live and when
 * the host's key word changes; null while nothing is known (not live, no key word), so the gate's read stands.
 */
function rereadKey(word: StreamWord | null): string | null {
  if (word === null || (word.connection !== "live" && word.key === null)) return null;
  return `${word.connection === "live" ? "live" : "off"}:${word.key ?? "-"}`;
}

/** A host from before round 11 under `unauthorized` or `loops-down`, no key word and no screen yet: poll for its key. */
function degradedOver(health: HostHealth | null, word: StreamWord | null): boolean {
  return word !== null && word.key === null && (word.connection === "unauthorized" || word.connection === "loops-down") && screenOver(health, word) === null;
}

const sameHealth = (a: HostHealth | null, b: HostHealth | null) => a === b || (a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b));

export function createHostHealth(options: HostHealthOptions): HostHealthModule {
  const now = options.now ?? (() => Date.now());
  const schedule =
    options.schedule ??
    ((fn: () => void, ms: number) => {
      const id = setTimeout(fn, ms);
      return () => clearTimeout(id);
    });
  let view: HealthView = { health: options.initial, read: null };
  const listeners = new Set<() => void>();
  const held = new Map<HealthNeed, number>();
  let word: StreamWord | null = null;
  let reread: string | null = null;
  let degraded = false;
  let reading = false;
  let again = false;
  let seq = 0;
  let disposed = false;
  let cancel: (() => void) | null = null;
  let pace: number | null = null;

  const holds = (kind: HealthNeed) => (held.get(kind) ?? 0) > 0;
  const fastest = (): number | null => {
    let ms: number | null = degraded ? HEALTH_POLL_MS.screen : null;
    for (const [kind, count] of held) {
      const every = HEALTH_POLL_MS[kind];
      if (count > 0 && every !== null && (ms === null || every < ms)) ms = every;
    }
    return ms;
  };
  // The poll: one timer at the fastest pace; restarted only when the pace changes, so a need that comes and goes at
  // the same pace does not push the next read back.
  const tick = () => {
    cancel = null;
    ask();
    arm();
  };
  const arm = () => {
    cancel?.();
    cancel = null;
    pace = disposed ? null : fastest();
    if (pace !== null) cancel = schedule(tick, pace);
  };
  const repace = () => {
    if (fastest() !== pace) arm();
  };
  const settle = (): boolean => {
    const was = degraded;
    degraded = degradedOver(view.health, word);
    repace();
    return degraded && !was;
  };

  async function read(): Promise<void> {
    reading = true;
    let fresh: HostHealth | null = null;
    try {
      fresh = await options.probe();
    } catch {
      fresh = null;
    }
    reading = false;
    if (disposed) return;
    seq += 1;
    // An answer equal to the one kept keeps the same object, so the page's readers do not render for nothing.
    const health = fresh === null || sameHealth(fresh, view.health) ? view.health : fresh;
    view = { health, read: { seq, at: now(), health: fresh } };
    for (const listener of [...listeners]) listener();
    if (settle()) again = true;
    if (again) {
      again = false;
      void read();
    }
  }
  function ask(): void {
    if (disposed) return;
    if (reading) again = true;
    else void read();
  }

  return {
    view: () => view,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    need(kind) {
      held.set(kind, (held.get(kind) ?? 0) + 1);
      ask();
      repace();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        held.set(kind, (held.get(kind) ?? 1) - 1);
        repace();
      };
    },
    stream(next) {
      const before = word;
      word = next === null ? null : { connection: next.connection, key: next.key };
      const key = rereadKey(word);
      let asks = key !== null && key !== reread;
      reread = key;
      // The Connection panel's rule: a change of the stream's state is asked about at once, not at the next poll.
      if (holds("panel") && before !== null && word !== null && before.connection !== word.connection) asks = true;
      if (settle()) asks = true;
      if (asks) ask();
    },
    ask,
    dispose() {
      disposed = true;
      cancel?.();
      cancel = null;
      listeners.clear();
    },
  };
}

/* The page's instance, made on first use: by then main.tsx has recorded the gate's decision and its health. */
let page: HostHealthModule | null = null;
export function pageHealth(): HostHealthModule {
  page ??= createHostHealth({ probe: () => probeHost("", HEALTH_TIMEOUT_MS), initial: sourceDecision().health });
  return page;
}

/** The health as last answered (the chat road, the source settings, the ticket links); null on a demo page. */
export const getHealth = (): HostHealth | null => pageHealth().view().health;
export const subscribeHealth = (listener: () => void) => pageHealth().subscribe(listener);
export function useHostHealth(): HostHealth | null {
  return useSyncExternalStore(subscribeHealth, getHealth, getHealth);
}

/** Holds `kind` while the caller is mounted and `kind` is not null. */
export function useHealthNeed(kind: HealthNeed | null): void {
  useEffect(() => (kind === null ? undefined : pageHealth().need(kind)), [kind]);
}

/** The view for a caller that shows the reads: the health, and the last read made since the caller mounted. */
export function useHealthView(): HealthView {
  const module = pageHealth();
  const view = useSyncExternalStore(module.subscribe, module.view, module.view);
  const [since] = useState(() => module.view().read?.seq ?? 0);
  return view.read !== null && view.read.seq > since ? view : { health: view.health, read: null };
}

/**
 * The stream's word to the module, and the screen that stands in for the running town (null: the town). A demo page
 * passes null.
 */
export function useLiveScreen(word: StreamWord | null): ConnectScreen | null {
  const module = pageHealth();
  const health = useHostHealth();
  const live = word !== null;
  const connection = word?.connection ?? null;
  const key = word?.key ?? null;
  useEffect(() => module.stream(live ? { connection, key } : null), [module, live, connection, key]);
  useEffect(() => () => module.stream(null), [module]);
  return word === null ? null : screenOver(health, word);
}

/** One read now: after a key was sent to the host or forgotten. */
export function askHealth(): void {
  pageHealth().ask();
}

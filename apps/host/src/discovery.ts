/**
 * How the host finds crewhub-loops by itself (spec addendum "a smooth connection", part 1). The order:
 *   1. an explicit URL or socket from the environment (the scripted road): taken as found, no probe;
 *   2. the Mac app's socket `<data>/run/api.sock`, when it exists and answers `GET /api/health`;
 *   3. `http://127.0.0.1:<port>`, the port from `<data>/settings.json` (default 8091), when it answers;
 *   4. nothing found: the host looks again every `intervalMs` (5 s), so starting the app later needs no restart.
 * The data folder is only read, never written. The web URL for the sign-in link follows what was found. Pure: the
 * disk and the probe are injected, so a test never reads the real app folder.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_LOOPS_URL, type PathKind, statPath } from "./config.ts";
import { type LoopsTarget, createTransport } from "./transport.ts";

export type DiscoveryVia = "env-url" | "env-socket" | "app-socket" | "app-port";

export interface Found {
  via: DiscoveryVia;
  target: LoopsTarget;
  /** The origin of loops' web app, for the sign-in link. */
  webUrl: string;
}

export interface Candidate extends Found {
  /** Whether the candidate must answer `GET /api/health` before it counts (the app's roads); the env's roads are taken as given. */
  probe: boolean;
}

export interface DiscoveryInput {
  /** `CREWHUB_WORLD_LOOPS_URL`, or null. */
  loopsUrl: string | null;
  /** `CREWHUB_WORLD_LOOPS_SOCKET` (validated), or null. */
  loopsSocket: string | null;
  /** `CREWHUB_WORLD_LOOPS_WEB_URL` resolved, or null: then the port found names the web app. */
  loopsWebUrl: string | null;
  /** The app's data folder (`CREWHUB_WORLD_LOOPS_APP_DATA` or the default). Read only. */
  appData: string;
  /** The disk, injected for tests. */
  statPath?: (file: string) => PathKind;
  readFile?: (file: string) => string | null;
  /** Does crewhub-loops answer `GET /api/health` there? Default: the transport, no key, 1.5 s. */
  answers?: (target: LoopsTarget) => Promise<boolean>;
}

/** The port in the app's `settings.json` (`{"port": 8091}`), as the app reads it: 1024 to 65535, else the default. */
export function appPortOf(settingsText: string | null): number {
  const fallback = Number(new URL(DEFAULT_LOOPS_URL).port);
  if (settingsText === null) return fallback;
  try {
    const parsed = JSON.parse(settingsText) as { port?: unknown };
    const port = typeof parsed.port === "number" ? parsed.port : typeof parsed.port === "string" ? Number(parsed.port) : NaN;
    return Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : fallback;
  } catch {
    return fallback;
  }
}

export const appSocketOf = (appData: string) => path.join(appData, "run", "api.sock");
export const appSettingsOf = (appData: string) => path.join(appData, "settings.json");

/** The roads in order, before any probe. Pure. */
export function candidates(input: DiscoveryInput): Candidate[] {
  if (input.loopsSocket !== null) {
    return [{ via: "env-socket", target: { transport: "unix", socketPath: input.loopsSocket }, webUrl: input.loopsWebUrl ?? DEFAULT_LOOPS_URL, probe: false }];
  }
  if (input.loopsUrl !== null) {
    return [{ via: "env-url", target: { transport: "tcp", url: input.loopsUrl }, webUrl: input.loopsWebUrl ?? new URL(input.loopsUrl).origin, probe: false }];
  }
  const stat = input.statPath ?? statPath;
  const read = input.readFile ?? readFileOrNull;
  const port = appPortOf(read(appSettingsOf(input.appData)));
  const url = `http://127.0.0.1:${port}`;
  const webUrl = input.loopsWebUrl ?? url;
  const out: Candidate[] = [];
  const socket = appSocketOf(input.appData);
  if (stat(socket)?.isSocket === true) out.push({ via: "app-socket", target: { transport: "unix", socketPath: socket }, webUrl, probe: true });
  out.push({ via: "app-port", target: { transport: "tcp", url }, webUrl, probe: true });
  return out;
}

/** What a target is called in a log line or a health answer: the URL or the socket path. */
export const targetText = (target: LoopsTarget): string => (target.transport === "tcp" ? target.url : target.socketPath);

export interface LoopsHealth {
  status: number;
  ok: boolean;
  /** loops' `version` (the app says `0.1.0`; a checkout says its commit). */
  version?: string;
}

/** `GET /api/health` without a key (it is public on crewhub-loops); null when nothing answers within `timeoutMs`. */
export async function loopsHealth(target: LoopsTarget, timeoutMs = 1500): Promise<LoopsHealth | null> {
  try {
    const response = await createTransport(target, {}).request("/api/health", {}, { accept: "application/json", timeoutMs });
    type HealthBody = { ok?: unknown; version?: unknown } | null;
    let body: HealthBody = null;
    try {
      body = (await response.json()) as HealthBody;
    } catch {
      body = null;
    }
    const out: LoopsHealth = { status: response.status, ok: response.status === 200 && body?.ok === true };
    if (typeof body?.version === "string") out.version = body.version;
    return out;
  } catch {
    return null;
  }
}

/** True for `200 {"ok":true,…}`: crewhub-loops is there. */
export async function loopsAnswers(target: LoopsTarget, timeoutMs = 1500): Promise<boolean> {
  return (await loopsHealth(target, timeoutMs))?.ok === true;
}

function readFileOrNull(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/** One pass over the roads: the first that counts, or null. */
export async function discoverOnce(input: DiscoveryInput): Promise<Found | null> {
  const answers = input.answers ?? loopsAnswers;
  for (const candidate of candidates(input)) {
    const { probe, ...found } = candidate;
    if (!probe || (await answers(found.target))) return found;
  }
  return null;
}

export interface Discovery {
  /** What was found, or null while searching. */
  current(): Found | null;
  /** The roads looked at in the last pass, for the log and the doctor ("what was looked for"). */
  lookedFor(): string[];
  /** Starts looking; resolves after the first pass. Keeps looking every `intervalMs` until something is found. */
  start(): Promise<Found | null>;
  /** Looks again now (and keeps looking when nothing is found): the host calls it when the stream reports loops down. */
  refresh(): Promise<Found | null>;
  stop(): void;
}

export interface DiscoveryOptions {
  intervalMs?: number;
  /** Called when the result changes (null → found, found → another target). */
  onChange?: (found: Found | null) => void;
  log?: (line: string) => void;
}

export function createDiscovery(input: DiscoveryInput, options: DiscoveryOptions = {}): Discovery {
  const intervalMs = options.intervalMs ?? 5000;
  const log = options.log ?? (() => {});
  let current: Found | null = null;
  let looked: string[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let pass: Promise<Found | null> | null = null;

  const same = (a: Found | null, b: Found | null) => (a === null || b === null ? a === b : a.via === b.via && targetText(a.target) === targetText(b.target));

  async function look(): Promise<Found | null> {
    looked = candidates(input).map((c) => `${c.via} ${targetText(c.target)}`);
    const found = await discoverOnce(input);
    if (stopped) return current;
    if (!same(found, current)) {
      current = found;
      log(found === null ? `loops not found (looked for ${looked.join(", ")}); looking again every ${intervalMs / 1000} s` : `loops found via ${found.via} at ${targetText(found.target)} (web ${found.webUrl})`);
      options.onChange?.(found);
    }
    if (found === null && !stopped) {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => void refresh(), intervalMs);
    }
    return found;
  }

  function refresh(): Promise<Found | null> {
    if (stopped) return Promise.resolve(current);
    if (pass === null) {
      pass = look().finally(() => {
        pass = null;
      });
    }
    return pass;
  }

  return {
    current: () => current,
    lookedFor: () => looked,
    start: refresh,
    refresh,
    stop() {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
    },
  };
}

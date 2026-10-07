/* Which source the world runs on: the scripted demo or the live host (`/world-api`, packages/loops-client
   `createHostSource`). The choice is made once, before the app mounts (main.tsx), from three inputs in this order:
   `?source=demo|live` in the URL, the viewer's setting (Settings > Source, kept in this browser), and, for `auto`, whether
   a host answers `probeHost()` within PROBE_TIMEOUT_MS. Pure functions here; the browser reads are in `readSourceSetting`
   and the decision in `decideSource`. The world's runtime (world.ts) reads the decision; the demo is the default. */
import type { HostHealth } from "@crewhub/loops-client";

export type SourceSetting = "auto" | "demo" | "live";
export type SourceId = "demo" | "live";
export const SOURCE_SETTINGS: readonly SourceSetting[] = ["auto", "demo", "live"];
export const SOURCE_SETTING_KEY = "crewhub-world.source";
/** How long `auto` waits for the host's health before falling back to the demo. */
export const PROBE_TIMEOUT_MS = 1500;
/** The crewhub-loops web app, where a person signs in (plan 3.5; phase 2). The host's health does not carry it yet. */
export const DEFAULT_LOOPS_URL = "http://127.0.0.1:8091";
/** The town document of the live source: one town per host, never a demo scenario's layout. */
export const LIVE_TOWN_KEY = "crewhub-world.live";

export interface SourceDecision {
  source: SourceId;
  /** What the viewer set (or `auto`). */
  setting: SourceSetting;
  /** The URL override, when the page has one. */
  override: SourceId | null;
  /** What the host answered when it was asked; null when it did not answer or was not asked. */
  health: HostHealth | null;
  /** Why this source, for Settings and the console's one info line. */
  reason: "url" | "setting" | "probe-answered" | "probe-silent";
}

export function parseSourceSetting(value: string | null | undefined): SourceSetting {
  return (SOURCE_SETTINGS as readonly string[]).includes(value ?? "") ? (value as SourceSetting) : "auto";
}

/** `?source=`: only an exact `demo` or `live` counts; anything else is no override. */
export function parseSourceOverride(value: string | null | undefined): SourceId | null {
  return value === "demo" || value === "live" ? value : null;
}

/** The pure choice: the URL wins, then a fixed setting, then the probe's answer. `probed` is whether a host answered. */
export function resolveSource(input: { override: SourceId | null; setting: SourceSetting; probed: boolean }): { source: SourceId; reason: SourceDecision["reason"] } {
  if (input.override) return { source: input.override, reason: "url" };
  if (input.setting !== "auto") return { source: input.setting, reason: "setting" };
  return input.probed ? { source: "live", reason: "probe-answered" } : { source: "demo", reason: "probe-silent" };
}

/** Whether a choice needs the host asked at all: only `auto` without a URL override. */
export function needsProbe(input: { override: SourceId | null; setting: SourceSetting }): boolean {
  return input.override === null && input.setting === "auto";
}

/** The storage key of the town document: the live town, else the scenario's (or the stress fixture's). */
export function townKeyFor(input: { source: SourceId; scenarioTownKey: string; stressSize: number | null }): string {
  if (input.source === "live") return LIVE_TOWN_KEY;
  return input.stressSize === null ? input.scenarioTownKey : `crewhub-world.stress-${input.stressSize}`;
}

/**
 * Makes the decision: parses the inputs, asks the host only when `auto` needs it (the probe answers null when nothing is
 * there within the timeout, never throws), and never reports more than one line. A silent probe is the normal case on a
 * machine without a host, so it is not an error.
 */
export async function decideSource(input: {
  param: string | null;
  setting: string | null;
  probe: (timeoutMs: number) => Promise<HostHealth | null>;
}): Promise<SourceDecision> {
  const override = parseSourceOverride(input.param);
  const setting = parseSourceSetting(input.setting);
  let health: HostHealth | null = null;
  if (needsProbe({ override, setting })) {
    try {
      health = await input.probe(PROBE_TIMEOUT_MS);
    } catch {
      health = null;
    }
  }
  const { source, reason } = resolveSource({ override, setting, probed: health !== null });
  return { source, setting, override, health, reason };
}

export function readSourceSetting(storage: Pick<Storage, "getItem"> | null | undefined = globalThis.localStorage): SourceSetting {
  try {
    return parseSourceSetting(storage?.getItem(SOURCE_SETTING_KEY));
  } catch {
    return "auto";
  }
}

export function writeSourceSetting(value: SourceSetting, storage: Pick<Storage, "setItem" | "removeItem"> | null | undefined = globalThis.localStorage): void {
  try {
    if (value === "auto") storage?.removeItem(SOURCE_SETTING_KEY);
    else storage?.setItem(SOURCE_SETTING_KEY, value);
  } catch {
    // Not kept: storage is unavailable (private mode). The choice lasts for this page.
  }
}

/** The page's URL with the source override removed, so a saved setting takes effect on the next load. */
export function hrefWithoutOverride(location: { pathname: string; search: string }): string {
  const params = new URLSearchParams(location.search);
  params.delete("source");
  const query = params.toString();
  return `${location.pathname}${query ? `?${query}` : ""}`;
}

/** The host as the browser reaches it: `/world-api` on this page's origin (Vite proxies it in dev; the host serves it in production). */
export function hostUrl(origin: string): string {
  return `${origin}/world-api`;
}

/**
 * Where "Sign in to crewhub-loops" goes: the loops web app the host names in its health (`loopsWebUrl`, optional; the
 * host adds it), else DEFAULT_LOOPS_URL. Only an http(s) URL is trusted for a link.
 */
export function loopsWebUrl(health: HostHealth | null | undefined): string {
  const url = health?.loopsWebUrl;
  return typeof url === "string" && /^https?:\/\//.test(url) ? url : DEFAULT_LOOPS_URL;
}

let decision: SourceDecision | null = null;

/** main.tsx records the decision before the app's modules load. */
export function setSourceDecision(value: SourceDecision): void {
  decision = value;
}

/** The decision made before mount; the demo when nothing decided (a side page, a test). */
export function sourceDecision(): SourceDecision {
  return decision ?? { source: "demo", setting: "auto", override: null, health: null, reason: "probe-silent" };
}

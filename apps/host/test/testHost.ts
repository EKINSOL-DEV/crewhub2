/**
 * The host a test builds (round 57d, docs/proposals/mutation-harness.md §5b.6): `createHost`, refused unless the test
 * aimed it. A host with no `loopsUrl` and no `loopsSocket` runs the discovery: with no app data folder it reads the
 * cwd, and with a folder whose `settings.json` is missing, unusable or names 8091 it probes 8091, the Mac app. The
 * no-app-reach preload refuses that probe, but only as a probe left to the guard; here a forgotten target is the test's
 * own error, thrown before any host exists. The test is `testHost.test.ts`.
 */
import { readFileSync } from "node:fs";
import { DEFAULT_LOOPS_URL } from "../src/config.ts";
import { appPortOf, appSettingsOf } from "../src/discovery.ts";
import { createHost, type Host, type HostOptions } from "../src/host.ts";

const APP_PORT = Number(new URL(DEFAULT_LOOPS_URL).port);

function readOrNull(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/**
 * Why a test's host options aim at nothing of the test's own, or null. The `settings.json` is read as the discovery
 * reads it: through `discovery.readFile` when the test injected one, else from the disk.
 */
export function untargeted(options: HostOptions): string | null {
  if (options.loopsUrl !== undefined || options.loopsSocket !== undefined) return null;
  const appData = options.discovery?.appData ?? "";
  if (appData === "") return "testHost: no loopsUrl, no loopsSocket and no discovery.appData: the discovery would read ./settings.json and probe 8091, the Mac app";
  const settings = appSettingsOf(appData);
  const text = (options.discovery?.readFile ?? readOrNull)(settings);
  if (text === null) return `testHost: ${settings} is missing: the discovery would probe 8091, the Mac app`;
  if (appPortOf(text) === APP_PORT) return `testHost: ${settings} names no port of the test's own: the discovery would probe ${APP_PORT}, the Mac app`;
  return null;
}

/** `createHost` for a test: throws `untargeted`'s reason before building anything. */
export function testHost(options: HostOptions): Promise<Host> {
  const problem = untargeted(options);
  if (problem !== null) return Promise.reject(new Error(problem));
  return createHost(options);
}

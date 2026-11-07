/**
 * The host a test builds (round 57d, docs/proposals/mutation-harness.md §5b.6): `createHost`, refused unless the test
 * aimed it. A host with no `loopsUrl` and no `loopsSocket` runs the discovery: with no app data folder it reads the
 * cwd, and with a folder whose `settings.json` is missing, unusable or names 8091 it probes 8091, the Mac app. The
 * no-app-reach preload refuses that probe, but only as a probe left to the guard; here a forgotten target is the test's
 * own error, thrown before any host exists. The test is `testHost.test.ts`.
 */
import { readFileSync } from "node:fs";
import { DEFAULT_LOOPS_URL } from "../src/config.ts";
import { type Connection, type ConnectionOptions, createConnection } from "../src/connection.ts";
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
  return untargetedAim("testHost", options.loopsUrl ?? null, options.loopsSocket ?? null, options.discovery?.appData ?? "", options.discovery?.readFile);
}

/** The same for a connection built directly (round 59d, C1): its discovery input is the aim. */
export function untargetedConnection(options: ConnectionOptions): string | null {
  return untargetedAim("testConnection", options.discovery.loopsUrl, options.discovery.loopsSocket, options.discovery.appData, options.discovery.readFile);
}

function untargetedAim(who: string, loopsUrl: string | null, loopsSocket: string | null, appData: string, readFile: ((file: string) => string | null) | undefined): string | null {
  if (loopsUrl !== null || loopsSocket !== null) return null;
  if (appData === "") return `${who}: no loopsUrl, no loopsSocket and no discovery.appData: the discovery would read ./settings.json and probe 8091, the Mac app`;
  const settings = appSettingsOf(appData);
  const text = (readFile ?? readOrNull)(settings);
  if (text === null) return `${who}: ${settings} is missing: the discovery would probe 8091, the Mac app`;
  if (appPortOf(text) === APP_PORT) return `${who}: ${settings} names no port of the test's own: the discovery would probe ${APP_PORT}, the Mac app`;
  return null;
}

/** `createHost` for a test: throws `untargeted`'s reason before building anything. */
export function testHost(options: HostOptions): Promise<Host> {
  const problem = untargeted(options);
  if (problem !== null) return Promise.reject(new Error(problem));
  return createHost(options);
}

/** `createConnection` for a test (connection.ts, round 59d C1): throws `untargetedConnection`'s reason before building anything. */
export function testConnection(options: ConnectionOptions): Connection {
  const problem = untargetedConnection(options);
  if (problem !== null) throw new Error(problem);
  return createConnection(options);
}

/**
 * The files of `apps/host/test` that may still call `createHost(` themselves (round 57d sweep), each with why. Every
 * other file builds its hosts with `testHost`. The list shrinks: a file here that no longer calls `createHost(` fails
 * the lint until it is taken off; a file not here yet (an answer branch's new test) may be named before it arrives.
 */
export const CREATE_HOST_ALLOWED: ReadonlyMap<string, string> = new Map([
  ["testHost.ts", "the helper itself"],
  ["testHost.test.ts", "the lint's own examples, as text"],
  ["health.test.ts", "task/q3-health-less changes its createHost calls: moving them would conflict"],
  ["pairing.test.ts", "task/r27-tab-pairing and task/q1-cookie-expiry change its createHost calls: moving them would conflict"],
  ["e2e.test.ts", "task/r27-tab-pairing changes the lines around its createHost call: moving it would conflict"],
  ["fuzzGuards.test.ts", "task/r27-tab-pairing changes the lines around its createHost call: moving it would conflict"],
  ["dmReadCap.test.ts", "task/q14-dm-read-cap adds it with createHost calls of its own"],
  ["bodyCap.test.ts", "task/q15-body-cap adds it with createHost calls of its own"],
]);

/**
 * The lint (pure): for each test file, given as its name and text, what is wrong with its `createHost(` calls. A file
 * off the list must call none; a file on the list (but the helper) must still call one, or it comes off the list.
 * A `createConnection(` call (round 59d, C1) is the helper's alone: every other file builds it with `testConnection`.
 */
export function createHostLint(files: readonly { name: string; text: string }[], allowed: ReadonlyMap<string, string> = CREATE_HOST_ALLOWED): string[] {
  const problems: string[] = [];
  for (const { name, text } of files) {
    const calls = (text.match(/\bcreateHost\(/g) ?? []).length;
    if (calls > 0 && !allowed.has(name)) problems.push(`${name}: ${calls} createHost( call(s); build the host with testHost (testHost.ts)`);
    if (calls === 0 && allowed.has(name) && name !== "testHost.ts") problems.push(`${name}: on CREATE_HOST_ALLOWED but calls no createHost( any more; take it off the list`);
    const connections = (text.match(/\bcreateConnection\(/g) ?? []).length;
    if (connections > 0 && name !== "testHost.ts") problems.push(`${name}: ${connections} createConnection( call(s); build the connection with testConnection (testHost.ts)`);
  }
  return problems;
}

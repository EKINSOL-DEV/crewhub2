/**
 * The pure part of the tools' rule "your own ports and folders" (round 36): what a tool may never bind, open or look
 * in, and the one way to ask for a port or a folder of its own. Nothing here touches the disk or the network; the test
 * is `scripts/test/toolGuard.test.ts`.
 *
 * - 5180 is the host's default port: Nicky's real `npm run world` may listen there, and Nicky's Vite proxies to it. A
 *   tool that binds it takes that place; a tool that opens it reads that host. Never a tool's.
 * - 8091, 8000 and 9443 are the Mac app's (its loops, `make dev-api`, its nginx). Never a tool's target or port.
 * - 8291 to 8293 (the development crewhub-loops), 8391 (a running loops-fake) and 5173 (a Vite dev server) are
 *   somebody's too (round 57d): never a tool's own port; the development loops are a tool's target only with its
 *   `--real` flag, the others never. The ports and their words are the one named-port list, `scripts/named-ports.mjs`,
 *   which the test preload reads as well.
 * - `~/Library/Application Support/be.ekinsol.crewhub` is the Mac app's data folder: a host whose discovery looks there
 *   finds the app. An empty app data folder means the cwd and then 8091. Never a tool's.
 */
import path from "node:path";
import { APP_PORTS, DEV_LOOPS_PORTS, HOST_DEFAULT_PORT, NAMED_PORTS, namedPort } from "../../scripts/named-ports.mjs";

export { APP_PORTS, HOST_DEFAULT_PORT };
export const APP_DATA_PARTS: readonly string[] = ["Library", "Application Support", "be.ekinsol.crewhub"];

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

const OTHERS = NAMED_PORTS.map((p) => p.port).filter((port) => port !== HOST_DEFAULT_PORT && !APP_PORTS.includes(port));
const WHY = `never ${HOST_DEFAULT_PORT} (the host's default port, somebody's real npm run world) nor ${APP_PORTS.join(", ")} (the Mac app's) nor ${OTHERS.join(", ")} (the development loops', a loops-fake's, Vite's)`;

/**
 * A port option of a tool: given, a whole number, and no named port (`scripts/named-ports.mjs`: not the host's default,
 * not the Mac app's, not the development loops', a loops-fake's or Vite's). `free` allows 0 (a free port) where the
 * tool's own browser opens whatever port came out; without it the port must be named, because a Vite proxy was started
 * toward it.
 */
export function ownPort(text: string | number | null | undefined, what: string, { free = false }: { free?: boolean } = {}): Verdict<number> {
  const given = text === null || text === undefined ? "" : String(text).trim();
  if (given === "") return { ok: false, reason: `${what} <port> is required: a port of your own, ${WHY}` };
  const port = Number(given);
  if (!Number.isInteger(port) || port < 0 || port > 65535) return { ok: false, reason: `${what} must be a port number, not "${given}"` };
  if (port === 0 && !free) return { ok: false, reason: `${what} must name the port (0 picks a free one, but your Vite proxies to one port)` };
  if (port === HOST_DEFAULT_PORT) return { ok: false, reason: `${what} ${port}: that is the host's default port, where somebody's real npm run world listens or will; a tool takes a port of its own` };
  if (APP_PORTS.includes(port)) return { ok: false, reason: `${what} ${port}: that is the Mac app's port, never a tool's` };
  const named = namedPort(port);
  if (named !== undefined) return { ok: false, reason: `${what} ${port}: that is ${named.why}, never a tool's own` };
  return { ok: true, value: port };
}

/**
 * A crewhub-loops URL a tool reads (`LOOPS_DEV_URL` of an env file, a `--loops-url`): plain http on this machine, a
 * port given, and no named port (a typo of 8291 is 8091) but the development loops' (8291 to 8293), and those only with
 * `real` (round 57d), which the caller passes from its own `--real` flag and from nothing else. Answers the origin.
 */
export function ownLoopsUrl(text: string | null | undefined, { real = false }: { real?: boolean } = {}): Verdict<string> {
  const given = text === null || text === undefined ? "" : String(text).trim();
  let url: URL;
  try {
    url = new URL(given);
  } catch {
    return { ok: false, reason: `"${given}" is not a URL` };
  }
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) || url.port === "") return { ok: false, reason: `${given} is not a loopback http URL with a port` };
  const port = Number(url.port);
  if (port === HOST_DEFAULT_PORT) return { ok: false, reason: `${given}: port ${port} is the host's default, not a crewhub-loops` };
  if (APP_PORTS.includes(port)) return { ok: false, reason: `${given}: port ${port} is the Mac app's, never a tool's target` };
  const named = namedPort(port);
  if (named !== undefined && DEV_LOOPS_PORTS.includes(port)) {
    if (!real) return { ok: false, reason: `${given}: port ${port} is ${named.why}: a tool aims there only with --real` };
  } else if (named !== undefined) return { ok: false, reason: `${given}: port ${port} is ${named.why}, never a tool's target` };
  return { ok: true, value: url.origin };
}

/**
 * A tool's `--loops-url` (its cli() options): `ownLoopsUrl` with the opt-in taken from the tool's own `--real` flag, a
 * flag being `true` and nothing else, so an option's text can never open the development loops.
 */
export function loopsUrlOption(opts: { "loops-url"?: unknown; real?: unknown }): Verdict<string> {
  const given = opts["loops-url"];
  const verdict = ownLoopsUrl(typeof given === "string" ? given : "", { real: opts.real === true });
  return verdict.ok ? verdict : { ok: false, reason: `--loops-url ${verdict.reason}` };
}

/** `~` and `~/…` as the shell would read them. */
export const expandHome = (text: string, home: string): string => (text === "~" || text.startsWith("~/") ? path.join(home, text.slice(1)) : text);

/**
 * The app data folder a tool's host looks in for crewhub-loops (`--loops-app-data`, `--app-data`): named, and not the Mac
 * app's own. Resolved against the cwd like every path a tool takes.
 */
export function ownAppData(text: string | null | undefined, home: string): Verdict<string> {
  const given = text === null || text === undefined ? "" : String(text).trim();
  if (given === "") return { ok: false, reason: "the app data folder is empty: a host would read ./settings.json and then probe 8091, the Mac app" };
  const dir = path.resolve(expandHome(given, home));
  const appData = path.join(home, ...APP_DATA_PARTS);
  if (dir === appData || dir.startsWith(appData + path.sep)) return { ok: false, reason: `${dir} is the Mac app's data folder: a tool's host never looks there` };
  return { ok: true, value: dir };
}

/**
 * The port a `settings.json` names, read as the host's discovery reads it (`{"port": 8291}`, 1024 to 65535, else the
 * host falls back to 8091): the folder is only a tool's when the file is there and the port is not the app's.
 */
export function appDataPort(settingsText: string | null): Verdict<number> {
  if (settingsText === null) return { ok: false, reason: "no settings.json in the app data folder: the host would fall back to 8091, the Mac app" };
  let port = NaN;
  try {
    const parsed = JSON.parse(settingsText) as { port?: unknown };
    port = typeof parsed.port === "number" ? parsed.port : typeof parsed.port === "string" ? Number(parsed.port) : NaN;
  } catch {
    port = NaN;
  }
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return { ok: false, reason: "settings.json names no usable port: the host would fall back to 8091, the Mac app" };
  if (APP_PORTS.includes(port)) return { ok: false, reason: `settings.json names port ${port}, the Mac app's: this folder is not a development loops'` };
  if (port === HOST_DEFAULT_PORT) return { ok: false, reason: `settings.json names port ${port}, the world host's default: this folder is not a loops'` };
  return { ok: true, value: port };
}

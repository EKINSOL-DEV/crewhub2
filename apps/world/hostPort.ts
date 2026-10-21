/*
 * The world's host port as Vite sees it: `CREWHUB_WORLD_PORT`, which `vite.config.ts` reads for the `/world-api` and
 * `/pair` proxy. The dev server (`npm run dev`) defaults to 5180, the host's own default, so `npm run dev` beside
 * `npm run host` meet without a word, as they always have. The preview server (`npm run preview`) never defaults: a
 * preview is somebody looking at a build, and a proxy to 5180 would reach whatever host runs there (on a shared machine,
 * another person's). Without the variable the preview proxies nothing: `/world-api` is answered as "no host" (204, what
 * the dev proxy answers when nothing listens), so the page runs the demo, and the preview says so once when it starts.
 * A value that is not a port is refused with a plain message, for both servers. Pure; the config applies it.
 */

export const HOST_PORT_VAR = "CREWHUB_WORLD_PORT";
/** The host's own default port (`apps/host`), the dev proxy's default target. */
export const DEFAULT_HOST_PORT = 5180;

export type ViteServer = "dev" | "preview";

export type HostPortPlan =
  /** Proxy `/world-api` and `/pair` to this port on 127.0.0.1. */
  | { proxy: true; port: number }
  /** No proxy; `note` is what the server prints once, and what `/pair` answers. */
  | { proxy: false; port: null; note: string };

/** A port as the variable may name it: an integer from 1 to 65535, with whitespace around it allowed; else null. */
export function parseHostPort(value: string): number | null {
  const text = value.trim();
  if (!/^\d{1,5}$/.test(text)) return null;
  const port = Number(text);
  return port >= 1 && port <= 65535 ? port : null;
}

/** The plan for one server from the environment; throws on a value that is not a port (the server must not start). */
export function hostPortPlan(env: Readonly<Record<string, string | undefined>>, server: ViteServer): HostPortPlan {
  const raw = env[HOST_PORT_VAR];
  if (raw === undefined || raw.trim() === "") {
    if (server === "dev") return { proxy: true, port: DEFAULT_HOST_PORT };
    return {
      proxy: false,
      port: null,
      note: `${HOST_PORT_VAR} is not set, so this preview proxies no /world-api: the page runs the demo. To look at a build against a host: ${HOST_PORT_VAR}=<the host's port> npm run preview`,
    };
  }
  const port = parseHostPort(raw);
  if (port === null) throw new Error(`${HOST_PORT_VAR}=${raw.trim()} is not a port number (1 to 65535): the ${server} server does not start`);
  return { proxy: true, port };
}

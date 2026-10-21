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

/**
 * The second question of the dev server (`npm run dev`), round 17: whose host is on that port? On a shared machine the
 * default 5180 holds somebody's host, and a page from this checkout over another checkout's host is a mismatch nobody
 * sees. The host says which checkout it runs from in health (`checkout`, apps/host `checkout.ts`: a short hash of the
 * repository root, never the path). The dev server asks the port once before it listens and
 *   - goes on when nothing answers (the page runs the demo until a host comes), when the answer is not a host's, when
 *     the host is this checkout's, or when the host is from before the id (it cannot tell, and says so);
 *   - refuses when the host names another checkout: the line names the port, both checkouts (this one by its path,
 *     the other by its id and key name) and the way out.
 * Pure: `devHostVerdict` takes the answer; the host package fetches it (`apps/host/src/checkout.ts`, `probeCheckout`:
 * the world's own code never calls the network outside the live source, and the dev server is Node, not the page).
 */
import type { HostAnswer } from "../host/src/checkout.ts";

export type DevHostVerdict = { ok: true; line: string } | { ok: false; line: string };

/** The one line of `npm run dev` about its host, or the refusal. `explicit`: the port came from CREWHUB_WORLD_PORT. */
export function devHostVerdict(input: { port: number; explicit: boolean; local: { root: string; id: string }; answer: HostAnswer }): DevHostVerdict {
  const where = `127.0.0.1:${input.port}`;
  const named = input.explicit ? `${HOST_PORT_VAR}=${input.port}` : `the default, ${HOST_PORT_VAR}=<port> names another`;
  const head = `dev: /world-api and /pair go to the host on ${where} (${named})`;
  const key = (name: string) => (name === "" ? "no key yet" : `key ${name}`);
  switch (input.answer.kind) {
    case "silent":
      return { ok: true, line: `${head}: nothing answers there now, the page runs the demo until a host does.` };
    case "not-a-host":
      return { ok: true, line: `${head}: what answers there is not the world's host, the page runs the demo.` };
    case "host": {
      const { checkout, keyName } = input.answer;
      if (checkout === null) return { ok: true, line: `${head}: a host answers (${key(keyName)}) from before the checkout id in health, so whose it is cannot be told; going on.` };
      if (checkout === input.local.id) return { ok: true, line: `${head}: this checkout's host (${key(keyName)}).` };
      return {
        ok: false,
        line:
          `The host on ${where} (${named}) belongs to another checkout: checkout id ${checkout}, ${key(keyName)}. ` +
          `This checkout is ${input.local.root} (checkout id ${input.local.id}). The dev server does not start. ` +
          `Start this checkout's host on a port of yours (${HOST_PORT_VAR}=<port> npm run host) and this Vite with the same ${HOST_PORT_VAR}, or stop that host if it is yours.`,
      };
    }
  }
}

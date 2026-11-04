/* The named ports (round 57d, docs/proposals/mutation-harness.md §5b.4): the one list of ports no test aims at and no
 * tool takes as its own, each with whose it is. Somebody's process holds each, or will: the Mac app, the development
 * crewhub-loops, a running loops-fake, somebody's `npm run world`, a Vite dev server.
 *
 * Two rules read it, and nothing else holds a copy:
 *   - the test preload `scripts/no-app-reach.mjs` refuses a connect to every one and a listen on all but Vite's;
 *   - the tools' rule `tools/lib/toolGuard.ts` refuses every one as a tool's own port, and every one as a tool's target
 *     but the development loops', which a tool reaches only with its `--real` flag.
 * A plain `.mjs` with no imports, so the preload can load it before anything else; `named-ports.d.mts` has its types.
 * The test is `scripts/test/namedPorts.test.ts`. */

/** Every named port, each with whose it is (the words both rules print). */
export const NAMED_PORTS = Object.freeze(
  [
    { port: 8091, why: "the Mac app's port (its crewhub-loops)" },
    { port: 8000, why: "the Mac app's port (its make dev-api)" },
    { port: 9443, why: "the Mac app's port (its nginx)" },
    { port: 8291, why: "the development crewhub-loops' port (tools/loops-dev.sh)" },
    { port: 8292, why: "a development crewhub-loops' port" },
    { port: 8293, why: "a development crewhub-loops' port (crewhub-loops main)" },
    { port: 8391, why: "a running loops-fake's default port" },
    { port: 5180, why: "the world host's default port, where somebody's npm run world listens" },
    { port: 5173, why: "the Vite dev server's port" },
  ].map((entry) => Object.freeze(entry)),
);

/** The Mac app's ports (its loops, `make dev-api`, its nginx): never a test's or a tool's, whatever the flag. */
export const APP_PORTS = Object.freeze([8091, 8000, 9443]);
/** The development crewhub-loops' ports: a tool's target only with `--real`. */
export const DEV_LOOPS_PORTS = Object.freeze([8291, 8292, 8293]);
/** The world host's default port. */
export const HOST_DEFAULT_PORT = 5180;
/** The Vite dev server's default port. */
export const VITE_PORT = 5173;

/** The named port's entry, or undefined for a port of one's own. */
export const namedPort = (port) => NAMED_PORTS.find((entry) => entry.port === port);

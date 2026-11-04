/* The Mac app's data folder, spelled once (round 60, pk-P3): `~/Library/Application Support/be.ekinsol.crewhub`, where
 * Crewhub.app keeps its crewhub-loops (its `settings.json` names the app's port; `run/api.sock` is its socket). Never
 * a test's or a tool's:
 *   - the test preload `scripts/no-app-reach.mjs` refuses every path under it (and a connect to its socket);
 *   - the tools' rule `tools/lib/toolGuard.ts` refuses it as a tool's host's app data folder.
 * A plain `.mjs` with no imports, so the preload can load it before anything else, beside `named-ports.mjs` (the
 * ports); `app-data.d.mts` has its types. The shell script `tools/loops-dev.sh` spells the folder for itself (no module
 * reaches a shell script). The test is `scripts/test/namedPorts.test.ts`. */

/** The folder's parts under the home: `path.join(home, ...APP_DATA_PARTS)`. */
export const APP_DATA_PARTS = Object.freeze(["Library", "Application Support", "be.ekinsol.crewhub"]);

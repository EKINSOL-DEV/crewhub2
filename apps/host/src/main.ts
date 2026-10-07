/**
 * Starts the host from the environment (see `config.ts` and the README):
 *   CREWHUB_WORLD_LOOPS_URL        crewhub-loops' URL (default http://127.0.0.1:8091, loopback TCP to Docker Desktop)
 *   CREWHUB_WORLD_KEY_FILE         the key file (default ~/.config/crewhub-loops/secrets/agent-crewhub-world.key;
 *                                  falls back to agent-builder.key in the same folder, with a loud warning)
 *   CREWHUB_WORLD_PORT             the port on 127.0.0.1 (default 5180)
 *   CREWHUB_WORLD_ALLOWED_ORIGINS  comma list of extra origins (the Vite dev server), default none
 *   NODE_ENV=production            serve apps/world/dist with an SPA fallback
 * The key is read once and kept in memory. It is never printed.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ConfigError, loadKey, loadServerConfig } from "./config.ts";
import { createHost } from "./host.ts";

const log = (line: string) => console.error(`[host] ${line}`);

function readFileOrNull(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

let key: string;
let keyName: string;
let sharedKey: boolean;
let config: ReturnType<typeof loadServerConfig>;
try {
  const loaded = loadKey(process.env, readFileOrNull);
  for (const warning of loaded.warnings) log(warning);
  ({ key, keyName, sharedKey } = loaded);
  config = loadServerConfig(process.env);
} catch (error) {
  log(error instanceof ConfigError ? error.message : "configuration failed");
  process.exit(1);
}

const staticDir = config.production ? fileURLToPath(new URL("../../world/dist/", import.meta.url)) : undefined;
const host = await createHost({
  loopsUrl: config.loopsUrl,
  key,
  keyName,
  sharedKey,
  port: config.port,
  allowedOrigins: config.allowedOrigins,
  log,
  ...(staticDir === undefined ? {} : { staticDir }),
});
log(`listening on ${host.url} (loops ${config.loopsUrl}, key ${keyName}${sharedKey ? ", the shared builder key" : ""}${config.production ? ", serving apps/world/dist" : ""})`);

const shutdown = () => {
  void host.close().then(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

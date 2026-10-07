/**
 * Starts the host from the environment:
 *   CREWHUB_WORLD_LOOPS_URL        crewhub-loops' URL (default http://127.0.0.1:8091, loopback TCP to Docker Desktop)
 *   CREWHUB_WORLD_KEY_FILE         the key file (default ~/.config/crewhub-loops/secrets/agent-crewhub-world.key;
 *                                  falls back to agent-builder.key in the same folder, with a warning)
 *   CREWHUB_WORLD_PORT             the port on 127.0.0.1 (default 5180)
 *   CREWHUB_WORLD_ALLOWED_ORIGINS  comma list of extra origins (the Vite dev server), default none
 *   NODE_ENV=production            serve apps/world/dist with an SPA fallback
 * The key is read once and kept in memory. It is never printed.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHost } from "./host.ts";

const DEFAULT_LOOPS_URL = "http://127.0.0.1:8091";
const DEFAULT_PORT = 5180;
const SECRETS_DIR = path.join(homedir(), ".config", "crewhub-loops", "secrets");
const DEFAULT_KEY_FILE = path.join(SECRETS_DIR, "agent-crewhub-world.key");
const BUILDER_KEY_FILE = path.join(SECRETS_DIR, "agent-builder.key");

const log = (line: string) => console.error(`[host] ${line}`);

function readKey(file: string): string | null {
  try {
    const text = readFileSync(file, "utf8").trim();
    return text === "" ? null : text;
  } catch {
    return null;
  }
}

/** `agent-<name>.key` → `<name>`; any other file name stays. */
function keyNameOf(file: string): string {
  const base = path.basename(file);
  const match = /^agent-(.+)\.key$/.exec(base);
  return match?.[1] ?? base.replace(/\.key$/, "");
}

function loadKey(): { key: string; keyName: string; sharedKey: boolean } {
  const configured = process.env.CREWHUB_WORLD_KEY_FILE;
  const wanted = configured === undefined || configured === "" ? DEFAULT_KEY_FILE : configured;
  const key = readKey(wanted);
  if (key !== null) {
    const keyName = keyNameOf(wanted);
    return { key, keyName, sharedKey: keyName === "builder" };
  }
  if (configured !== undefined && configured !== "") {
    log(`cannot read the key file ${wanted}`);
    process.exit(1);
  }
  const builder = readKey(BUILDER_KEY_FILE);
  if (builder === null) {
    log(`no key: neither ${DEFAULT_KEY_FILE} nor ${BUILDER_KEY_FILE} is readable. Register an agent crewhub-world (see apps/host/README.md).`);
    process.exit(1);
  }
  log(`WARNING: ${DEFAULT_KEY_FILE} is missing, using the shared builder key ${BUILDER_KEY_FILE}.`);
  log("WARNING: crewhub-loops limits the builder key to tickets, comments and attachments of its member projects:");
  log("WARNING: /api/projects, /api/board, /api/team and the event stream answer 403, so the world will show Unauthorized.");
  log("WARNING: register an agent crewhub-world with a probe key instead (docs/LOOPS_SETUP.md, apps/host/README.md).");
  return { key: builder, keyName: "builder", sharedKey: true };
}

const { key, keyName, sharedKey } = loadKey();
const portText = process.env.CREWHUB_WORLD_PORT ?? "";
const port = portText === "" ? DEFAULT_PORT : Number(portText);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  log(`CREWHUB_WORLD_PORT must be a port number, got ${portText}`);
  process.exit(1);
}
const loopsUrl = process.env.CREWHUB_WORLD_LOOPS_URL ?? DEFAULT_LOOPS_URL;
const allowedOrigins = (process.env.CREWHUB_WORLD_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter((s) => s !== "");
const production = process.env.NODE_ENV === "production";
const staticDir = production ? fileURLToPath(new URL("../../world/dist/", import.meta.url)) : undefined;

const host = await createHost({
  loopsUrl,
  key,
  keyName,
  sharedKey,
  port,
  allowedOrigins,
  log,
  ...(staticDir === undefined ? {} : { staticDir }),
});
log(`listening on ${host.url} (loops ${loopsUrl}, key ${keyName}${sharedKey ? ", the shared builder key" : ""}${production ? ", serving apps/world/dist" : ""})`);

const shutdown = () => {
  void host.close().then(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

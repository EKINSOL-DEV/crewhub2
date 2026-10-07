/**
 * The host's configuration from the environment, as a pure function so a test can run it: which key file to read
 * (the configured one, the default, or the shared builder key as a loud fallback), the port, the loops URL, the
 * extra origins and the pairing switches. The key's text is returned to the caller and nowhere else.
 */
import { homedir } from "node:os";
import path from "node:path";

export const DEFAULT_LOOPS_URL = "http://127.0.0.1:8091";
export const DEFAULT_PORT = 5180;
export const SECRETS_DIR = path.join(homedir(), ".config", "crewhub-loops", "secrets");
export const DEFAULT_KEY_FILE = path.join(SECRETS_DIR, "agent-crewhub-world.key");
export const BUILDER_KEY_FILE = path.join(SECRETS_DIR, "agent-builder.key");

export interface KeyConfig {
  key: string;
  keyName: string;
  sharedKey: boolean;
  /** Lines for the log: the fallback's warning. Never the key. */
  warnings: string[];
}

/** `agent-<name>.key` → `<name>`; any other file name stays, without `.key`. */
export function keyNameOf(file: string): string {
  const base = path.basename(file);
  const match = /^agent-(.+)\.key$/.exec(base);
  return match?.[1] ?? base.replace(/\.key$/, "");
}

export class ConfigError extends Error {}

/**
 * Picks and reads the key. `read` returns a file's text or null when it cannot be read.
 * A configured file that cannot be read is an error; only the default falls back to the builder key.
 */
export function loadKey(env: Record<string, string | undefined>, read: (file: string) => string | null, files = { defaultKey: DEFAULT_KEY_FILE, builderKey: BUILDER_KEY_FILE }): KeyConfig {
  const configured = env.CREWHUB_WORLD_KEY_FILE;
  const wanted = configured === undefined || configured === "" ? files.defaultKey : configured;
  const key = read(wanted)?.trim() ?? "";
  if (key !== "") {
    const keyName = keyNameOf(wanted);
    return { key, keyName, sharedKey: keyName === "builder", warnings: [] };
  }
  if (configured !== undefined && configured !== "") throw new ConfigError(`cannot read the key file ${wanted}`);
  const builder = read(files.builderKey)?.trim() ?? "";
  if (builder === "") {
    throw new ConfigError(`no key: neither ${files.defaultKey} nor ${files.builderKey} is readable. Register an agent crewhub-world (see apps/host/README.md and docs/LOOPS_SETUP.md).`);
  }
  return {
    key: builder,
    keyName: "builder",
    sharedKey: true,
    warnings: [
      `WARNING: ${files.defaultKey} is missing, using the shared builder key ${files.builderKey}.`,
      "WARNING: crewhub-loops limits the builder key to tickets, comments and attachments of its member projects:",
      "WARNING: /api/projects, /api/board, /api/team and the event stream answer 403, so the world will show Unauthorized.",
      "WARNING: register an agent crewhub-world with a probe key instead (docs/LOOPS_SETUP.md, apps/host/README.md).",
    ],
  };
}

export interface ServerConfig {
  loopsUrl: string;
  port: number;
  allowedOrigins: string[];
  production: boolean;
  /** `off` only outside production, and loudly (see `warnings`). */
  pairing: "on" | "off";
  /** The file that keeps the pairing secret across restarts; none means a per-run secret. */
  pairingFile: string | null;
  /** Where a browser reaches the host behind a TLS proxy; https means a `Secure` cookie. */
  publicUrl: string | null;
  /** Lines for the log at start. Never a secret. */
  warnings: string[];
}

export function loadServerConfig(env: Record<string, string | undefined>): ServerConfig {
  const portText = env.CREWHUB_WORLD_PORT ?? "";
  const port = portText === "" ? DEFAULT_PORT : Number(portText);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new ConfigError(`CREWHUB_WORLD_PORT must be a port number, got ${portText}`);
  const loopsUrl = env.CREWHUB_WORLD_LOOPS_URL ?? DEFAULT_LOOPS_URL;
  if (!/^https?:\/\//.test(loopsUrl)) throw new ConfigError("CREWHUB_WORLD_LOOPS_URL must start with http:// or https://");
  const allowedOrigins = (env.CREWHUB_WORLD_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  const production = env.NODE_ENV === "production";
  const pairingText = (env.CREWHUB_WORLD_PAIRING ?? "on").trim().toLowerCase();
  if (pairingText !== "on" && pairingText !== "off") throw new ConfigError(`CREWHUB_WORLD_PAIRING must be on or off, got ${pairingText}`);
  if (pairingText === "off" && production) throw new ConfigError("CREWHUB_WORLD_PAIRING=off is refused with NODE_ENV=production: pairing is what keeps other pages and processes out of the world's data");
  const warnings: string[] = [];
  if (pairingText === "off") {
    warnings.push("WARNING: CREWHUB_WORLD_PAIRING=off: any page or process on this machine can read the world's data through /world-api.");
    warnings.push("WARNING: this is for development only (the Vite proxy); production refuses it.");
  }
  const pairingFileText = (env.CREWHUB_WORLD_PAIRING_FILE ?? "").trim();
  const pairingFile = pairingFileText === "" ? null : path.resolve(pairingFileText);
  const publicUrlText = (env.CREWHUB_WORLD_PUBLIC_URL ?? "").trim();
  let publicUrl: string | null = null;
  if (publicUrlText !== "") {
    let parsed: URL;
    try {
      parsed = new URL(publicUrlText);
    } catch {
      throw new ConfigError("CREWHUB_WORLD_PUBLIC_URL must be an http(s) URL");
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new ConfigError("CREWHUB_WORLD_PUBLIC_URL must be an http(s) URL");
    publicUrl = parsed.origin;
  }
  return { loopsUrl, port, allowedOrigins, production, pairing: pairingText, pairingFile, publicUrl, warnings };
}

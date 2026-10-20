import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { homedir } from "node:os";
import path from "node:path";
import { ConfigError, keyNameOf, loadKey, loadServerConfig, validateSocketPath } from "../src/config.ts";

const files = { defaultKey: "/secrets/agent-crewhub-world.key", builderKey: "/secrets/agent-builder.key" };
const disk = (contents: Record<string, string>) => (file: string) => contents[file] ?? null;

describe("the key file", () => {
  it("reads the default file and names the key after it", () => {
    const loaded = loadKey({}, disk({ [files.defaultKey]: "chl_world\n" }), files);
    assert.deepEqual(loaded, { key: "chl_world", keyName: "crewhub-world", sharedKey: false, warnings: [] });
  });

  it("reads a configured file and fails loudly when it cannot be read (no silent fallback)", () => {
    const loaded = loadKey({ CREWHUB_WORLD_KEY_FILE: "/tmp/loops-fake.key" }, disk({ "/tmp/loops-fake.key": "chl_fake" }), files);
    assert.equal(loaded.key, "chl_fake");
    assert.equal(loaded.keyName, "loops-fake");
    assert.throws(() => loadKey({ CREWHUB_WORLD_KEY_FILE: "/nowhere.key" }, disk({ [files.builderKey]: "chl_builder" }), files), ConfigError);
  });

  it("falls back to the shared builder key with a warning that loops will refuse it", () => {
    const loaded = loadKey({}, disk({ [files.builderKey]: "chl_builder" }), files);
    assert.equal(loaded.key, "chl_builder");
    assert.equal(loaded.keyName, "builder");
    assert.equal(loaded.sharedKey, true);
    assert.ok(loaded.warnings.length >= 2);
    assert.ok(loaded.warnings.some((w) => w.includes("403")));
    assert.ok(loaded.warnings.every((w) => !w.includes("chl_builder")), "the warning never holds the key");
  });

  it("fails when no key file exists at all", () => {
    assert.throws(() => loadKey({}, disk({}), files), /no key/);
  });

  it("names keys by file", () => {
    assert.equal(keyNameOf("/x/agent-builder.key"), "builder");
    assert.equal(keyNameOf("loops-fake.key"), "loops-fake");
  });
});

describe("the server config", () => {
  it("has the plan's defaults", () => {
    assert.deepEqual(loadServerConfig({}), { loopsUrl: "http://127.0.0.1:8091", loopsSocket: null, port: 5180, allowedOrigins: [], production: false, pairing: "on", pairingFile: null, publicUrl: null, warnings: [] });
  });

  it("reads the environment and rejects a bad port or URL", () => {
    const config = loadServerConfig({ CREWHUB_WORLD_PORT: "5190", CREWHUB_WORLD_LOOPS_URL: "http://localhost:8091/", CREWHUB_WORLD_ALLOWED_ORIGINS: "http://localhost:5173, http://127.0.0.1:5173", NODE_ENV: "production" });
    assert.deepEqual(config, { loopsUrl: "http://localhost:8091/", loopsSocket: null, port: 5190, allowedOrigins: ["http://localhost:5173", "http://127.0.0.1:5173"], production: true, pairing: "on", pairingFile: null, publicUrl: null, warnings: [] });
    assert.throws(() => loadServerConfig({ CREWHUB_WORLD_PORT: "world" }), ConfigError);
    assert.throws(() => loadServerConfig({ CREWHUB_WORLD_LOOPS_URL: "ftp://x" }), ConfigError);
  });
});

describe("the loops socket", () => {
  /** A disk with one socket and one plain file. */
  const probe = (file: string) => (file === "/run/api.sock" ? { isSocket: true } : file === "/run/serve.pid" ? { isSocket: false } : null);

  it("validates the path: it must exist and be a socket, and ~ is the home folder", () => {
    assert.equal(validateSocketPath("/run/api.sock", probe), "/run/api.sock");
    assert.equal(validateSocketPath(" /run/api.sock ", probe), "/run/api.sock", "surrounding whitespace is dropped");
    assert.throws(() => validateSocketPath("/run/nothing.sock", probe), (e: unknown) => e instanceof ConfigError && /does not exist/.test(e.message));
    assert.throws(() => validateSocketPath("/run/serve.pid", probe), (e: unknown) => e instanceof ConfigError && /not a Unix socket/.test(e.message));
    const seen: string[] = [];
    assert.throws(() => validateSocketPath("~/crewhub-loops-dev/run/api.sock", (f) => (seen.push(f), null)));
    assert.deepEqual(seen, [path.join(homedir(), "crewhub-loops-dev", "run", "api.sock")]);
  });

  it("is explicit only: unset means TCP, set means the socket, and never both", () => {
    assert.equal(loadServerConfig({}, probe).loopsSocket, null);
    assert.equal(loadServerConfig({ CREWHUB_WORLD_LOOPS_SOCKET: "" }, probe).loopsSocket, null, "empty is unset");
    const unix = loadServerConfig({ CREWHUB_WORLD_LOOPS_SOCKET: "/run/api.sock" }, probe);
    assert.equal(unix.loopsSocket, "/run/api.sock");
    assert.equal(unix.loopsUrl, "http://127.0.0.1:8091", "the URL keeps its default: it names the web app for the sign-in link");
    assert.throws(
      () => loadServerConfig({ CREWHUB_WORLD_LOOPS_SOCKET: "/run/api.sock", CREWHUB_WORLD_LOOPS_URL: "http://127.0.0.1:8291" }, probe),
      (e: unknown) => e instanceof ConfigError && /both set/.test(e.message) && /Unset one/.test(e.message),
    );
    assert.throws(() => loadServerConfig({ CREWHUB_WORLD_LOOPS_SOCKET: "/run/missing.sock" }, probe), ConfigError);
  });

  it("checks the real disk by default (a plain file is refused)", () => {
    assert.throws(() => loadServerConfig({ CREWHUB_WORLD_LOOPS_SOCKET: new URL(import.meta.url).pathname }), /not a Unix socket/);
    assert.throws(() => loadServerConfig({ CREWHUB_WORLD_LOOPS_SOCKET: "/nowhere/at/all.sock" }), /does not exist/);
  });
});

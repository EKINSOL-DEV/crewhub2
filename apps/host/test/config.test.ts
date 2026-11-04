import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { homedir } from "node:os";
import path from "node:path";
import { ConfigError, KEY_SHAPE, worldEnv, DEFAULT_APP_DATA, keyFilesOf, keyNameOf, loadKey, loadServerConfig, resolveLoopsWebUrl, validateSocketPath, configFolderLine } from "../src/config.ts";

const files = { storedKey: "/me/.config/crewhub-world/loops-key", defaultKey: "/secrets/agent-crewhub-world.key" };
const disk = (contents: Record<string, string>) => (file: string) => contents[file] ?? null;

describe("the key file", () => {
  it("reads the old default file third in line and names the key after it", () => {
    const loaded = loadKey({}, disk({ [files.defaultKey]: "chl_world\n" }), files);
    assert.deepEqual(loaded, { key: "chl_world", keyName: "crewhub-world", source: "default", file: files.defaultKey });
  });

  it("prefers the stored key (the Connect screen's) over the old default file", () => {
    const loaded = loadKey({}, disk({ [files.storedKey]: "chl_stored\n", [files.defaultKey]: "chl_world" }), files);
    assert.deepEqual(loaded, { key: "chl_stored", keyName: "crewhub-world", source: "stored", file: files.storedKey });
  });

  it("reads a configured file first and fails loudly when it cannot be read (no silent fallback)", () => {
    const loaded = loadKey({ CREWHUB_WORLD_KEY_FILE: "/tmp/loops-fake.key" }, disk({ "/tmp/loops-fake.key": "chl_fake", [files.storedKey]: "chl_stored" }), files);
    assert.equal(loaded?.key, "chl_fake");
    assert.equal(loaded?.keyName, "loops-fake");
    assert.equal(loaded?.source, "env");
    assert.throws(() => loadKey({ CREWHUB_WORLD_KEY_FILE: "/nowhere.key" }, disk({ [files.storedKey]: "chl_stored" }), files), ConfigError);
  });

  it("starts without a key when no file has one: the Connect screen, no builder fallback", () => {
    assert.equal(loadKey({}, disk({}), files), null);
    assert.equal(loadKey({}, disk({ "/secrets/agent-builder.key": "chl_builder" }), files), null, "the builder key is never read");
    assert.equal(loadKey({}, disk({ [files.storedKey]: "  \n" }), files), null, "an empty stored file is no key");
  });

  it("names keys by file", () => {
    assert.equal(keyNameOf("/x/agent-builder.key"), "builder");
    assert.equal(keyNameOf("loops-fake.key"), "loops-fake");
    assert.equal(keyNameOf("/me/.config/crewhub-world/loops-key"), "crewhub-world");
  });

  it("npm run world keeps the pairing secret in the host's own folder unless a file is named", () => {
    const env = worldEnv({ CREWHUB_WORLD_CONFIG_DIR: "/tmp/cw", HOME: "/me" });
    assert.equal(env.NODE_ENV, "production");
    assert.equal(env.CREWHUB_WORLD_PAIRING_FILE, "/tmp/cw/pairing-secret");
    assert.equal(worldEnv({}).CREWHUB_WORLD_PAIRING_FILE, path.join(homedir(), ".config", "crewhub-world", "pairing-secret"));
    assert.equal(worldEnv({ CREWHUB_WORLD_PAIRING_FILE: "/tmp/other" }).CREWHUB_WORLD_PAIRING_FILE, "/tmp/other");
    assert.equal(loadServerConfig(worldEnv({ CREWHUB_WORLD_CONFIG_DIR: "/tmp/cw" })).pairingFile, "/tmp/cw/pairing-secret");
  });

  it("reads ~/ in CREWHUB_WORLD_PAIRING_FILE as the home folder, as every other path it takes (never a folder named ~ in the working directory)", () => {
    assert.equal(loadServerConfig({ CREWHUB_WORLD_PAIRING_FILE: "~/cw/pairing-secret" }).pairingFile, path.join(homedir(), "cw", "pairing-secret"));
  });

  it("puts the stored key in the host's own folder, CREWHUB_WORLD_CONFIG_DIR when set", () => {
    assert.equal(keyFilesOf({}).storedKey, path.join(homedir(), ".config", "crewhub-world", "loops-key"));
    assert.equal(keyFilesOf({ CREWHUB_WORLD_CONFIG_DIR: "/tmp/cw" }).storedKey, "/tmp/cw/loops-key");
    assert.equal(keyFilesOf({ CREWHUB_WORLD_CONFIG_DIR: "~/cw" }).storedKey, path.join(homedir(), "cw", "loops-key"));
  });
});

describe("the server config", () => {
  const own = { appData: DEFAULT_APP_DATA, configDir: path.join(homedir(), ".config", "crewhub-world") };

  it("has the plan's defaults: no URL means the discovery of the Mac app", () => {
    assert.deepEqual(loadServerConfig({}), { loopsUrl: null, loopsSocket: null, loopsWebUrl: null, ...own, port: 5180, allowedOrigins: [], production: false, pairing: "on", pairingFile: null, pairingIdleDays: 30, publicUrl: null, warnings: [] });
    assert.equal(loadServerConfig({ CREWHUB_WORLD_LOOPS_APP_DATA: "~/crewhub-loops-dev" }).appData, path.join(homedir(), "crewhub-loops-dev"));
  });

  it("reads the environment and rejects a bad port or URL", () => {
    const config = loadServerConfig({ CREWHUB_WORLD_PORT: "5190", CREWHUB_WORLD_LOOPS_URL: "http://localhost:8091/", CREWHUB_WORLD_ALLOWED_ORIGINS: "http://localhost:5173, http://127.0.0.1:5173", NODE_ENV: "production" });
    assert.deepEqual(config, { loopsUrl: "http://localhost:8091/", loopsSocket: null, loopsWebUrl: "http://localhost:8091", ...own, port: 5190, allowedOrigins: ["http://localhost:5173", "http://127.0.0.1:5173"], production: true, pairing: "on", pairingFile: null, pairingIdleDays: 30, publicUrl: null, warnings: [] });
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
    assert.equal(unix.loopsUrl, null);
    assert.equal(unix.loopsWebUrl, "http://127.0.0.1:8091", "a socket has no origin: the app's default port names the web app for the sign-in link");
    assert.equal(loadServerConfig({ CREWHUB_WORLD_LOOPS_SOCKET: "/run/api.sock", CREWHUB_WORLD_LOOPS_WEB_URL: "http://127.0.0.1:8291/" }, probe).loopsWebUrl, "http://127.0.0.1:8291", "socket mode can name another web app");
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

describe("the loops web URL", () => {
  it("is the loops URL's origin unless CREWHUB_WORLD_LOOPS_WEB_URL names another http(s) origin", () => {
    assert.equal(resolveLoopsWebUrl(undefined, "http://localhost:8091/"), "http://localhost:8091");
    assert.equal(resolveLoopsWebUrl(undefined, null), null, "nothing named: the discovery names it");
    assert.equal(resolveLoopsWebUrl("  ", "http://127.0.0.1:8291"), "http://127.0.0.1:8291", "blank is unset");
    assert.equal(resolveLoopsWebUrl("https://localhost:8443/app/", "http://127.0.0.1:8091"), "https://localhost:8443", "only the origin");
    assert.throws(() => resolveLoopsWebUrl("localhost:8091", "http://127.0.0.1:8091"), (e: unknown) => e instanceof ConfigError && /http\(s\) URL/.test(e.message));
    assert.throws(() => resolveLoopsWebUrl("ftp://x", "http://127.0.0.1:8091"), ConfigError);
    assert.equal(loadServerConfig({ CREWHUB_WORLD_LOOPS_URL: "http://127.0.0.1:8291", CREWHUB_WORLD_LOOPS_WEB_URL: "http://localhost:8291" }).loopsWebUrl, "http://localhost:8291");
    assert.throws(() => loadServerConfig({ CREWHUB_WORLD_LOOPS_WEB_URL: "nope" }), ConfigError);
  });
});

describe("the config folder line (round 34)", () => {
  it("names the default folder, and the variable when it is set, with the home folder as ~", () => {
    assert.equal(configFolderLine({}, homedir()), "config folder ~/.config/crewhub-world (the default ~/.config/crewhub-world)");
    assert.equal(configFolderLine({ CREWHUB_WORLD_CONFIG_DIR: "/tmp/my-world" }, "/Users/me"), "config folder /tmp/my-world (from CREWHUB_WORLD_CONFIG_DIR)");
    assert.equal(configFolderLine({ CREWHUB_WORLD_CONFIG_DIR: "/Users/me/world-trial" }, "/Users/me"), "config folder ~/world-trial (from CREWHUB_WORLD_CONFIG_DIR)");
    assert.equal(configFolderLine({ CREWHUB_WORLD_CONFIG_DIR: "   " }, "/Users/me").endsWith("(the default ~/.config/crewhub-world)"), true, "blank is unset");
  });
});

describe("a setting that holds an http(s) URL (round 60, H7: one rule for the sign-in link and the public URL)", () => {
  const settings: [string, (text: string) => string | null][] = [
    ["CREWHUB_WORLD_LOOPS_WEB_URL", (text) => resolveLoopsWebUrl(text, null)],
    ["CREWHUB_WORLD_PUBLIC_URL", (text) => loadServerConfig({ CREWHUB_WORLD_PUBLIC_URL: text }).publicUrl],
  ];
  for (const [name, read] of settings) {
    it(`${name} answers the origin, and refuses anything else by its own name`, () => {
      assert.equal(read("http://127.0.0.1:5381/some/path?q=1"), "http://127.0.0.1:5381");
      assert.equal(read("  https://localhost:5381/  "), "https://localhost:5381");
      for (const bad of ["not a url", "ftp://localhost", "javascript:alert(1)", "/just/a/path"]) {
        assert.throws(() => read(bad), (error: unknown) => error instanceof ConfigError && error.message === `${name} must be an http(s) URL`, bad);
      }
    });
  }
});

describe("a key's shape (round 60, H7: one rule for a pasted key and the doctor's reading of a file)", () => {
  it("is chl_ and 8 to 200 of letters, digits, - and _, one line", () => {
    for (const yes of [`chl_${"a".repeat(8)}`, `chl_${"Z9-_".repeat(50)}`]) assert.equal(KEY_SHAPE.test(yes), true, yes);
    for (const no of ["", "chl_", `chl_${"a".repeat(7)}`, `chl_${"a".repeat(201)}`, `key_${"a".repeat(20)}`, `chl_${"a".repeat(8)} x`, `chl_${"a".repeat(8)}\nb`, `CHL_${"a".repeat(8)}`]) assert.equal(KEY_SHAPE.test(no), false, JSON.stringify(no));
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConfigError, keyNameOf, loadKey, loadServerConfig } from "../src/config.ts";

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
    assert.deepEqual(loadServerConfig({}), { loopsUrl: "http://127.0.0.1:8091", port: 5180, allowedOrigins: [], production: false });
  });

  it("reads the environment and rejects a bad port or URL", () => {
    const config = loadServerConfig({ CREWHUB_WORLD_PORT: "5190", CREWHUB_WORLD_LOOPS_URL: "http://localhost:8091/", CREWHUB_WORLD_ALLOWED_ORIGINS: "http://localhost:5173, http://127.0.0.1:5173", NODE_ENV: "production" });
    assert.deepEqual(config, { loopsUrl: "http://localhost:8091/", port: 5190, allowedOrigins: ["http://localhost:5173", "http://127.0.0.1:5173"], production: true });
    assert.throws(() => loadServerConfig({ CREWHUB_WORLD_PORT: "world" }), ConfigError);
    assert.throws(() => loadServerConfig({ CREWHUB_WORLD_LOOPS_URL: "ftp://x" }), ConfigError);
  });
});

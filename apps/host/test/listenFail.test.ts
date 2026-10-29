import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createHost } from "../src/host.ts";

const timers = () => process.getActiveResourcesInfo().filter((kind) => kind === "Timeout").length;

describe("a host that cannot listen", () => {
  it("rejects and leaves no timer behind, so the process that asked can end", async () => {
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", () => resolve()));
    const port = (blocker.address() as { port: number }).port;
    // An app data folder that names a free port, so nothing here would look at 8091 (AGENTS.md).
    const appData = mkdtempSync(path.join(tmpdir(), "crewhub-listen-fail-"));
    writeFileSync(path.join(appData, "settings.json"), JSON.stringify({ port: 1 }));
    try {
      const before = timers();
      await assert.rejects(createHost({ port, pairing: "off", log: () => undefined, discovery: { appData, answers: async () => false } }), /EADDRINUSE/);
      assert.equal(timers(), before, "the idle heartbeat of a host that never listened keeps running and holds the process open");
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
  });
});

/**
 * A5's second race through a real host (round 61; the test r61-names wrote for the review, taken in with a tidy): loops
 * A's snapshot is held at its last read before the archive report, discovery switches to B and B links, then A's read
 * is answered and A's assembly reports. The report comes through A's link's handle, and A's link is gone: nothing of
 * A's may land under B's name (the file, B's memory), and the host says it dropped the report. No stub edit: a proxy
 * in front of A holds the one read, the pattern of connectionSnapshot.test.ts. Red on H6 (`bbc92b92`: A's slug saved
 * under B), green with the handle. Everything on 127.0.0.1 port 0 and temp folders.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { createArchiveStore } from "../src/archiveStore.ts";
import { createLoopsStub, envelope, installation } from "./loopsStub.ts";
import { testHost } from "./testHost.ts";
import { waitFor } from "./wait.ts";

const archived = (seq: number, slug: string) => envelope(seq, "project.archived", { project: { slug, key: slug.toUpperCase() }, actor: { id: "nicky", kind: "user" }, payload: { changed: ["archivedAt"], old: {}, new: { archivedAt: "2026-10-26T00:00:00.000Z" } } });

describe("the late report of a link that is gone, through the host (round 61, A5's second race)", () => {
  const cleanup: (() => Promise<void> | void)[] = [];
  afterEach(async () => {
    for (const fn of cleanup.reverse()) await fn();
    cleanup.length = 0;
  });

  it("A's snapshot report after B's link saves nothing under B, and the host says it dropped it", async () => {
    const base = installation();
    const old = base.routes["/api/projects/old"] as { project: Record<string, unknown> };
    const a = await createLoopsStub({ ...base, routes: { ...base.routes, "/api/projects/old-a": { project: { ...old.project, id: "pr_old-a", slug: "old-a", key: "OLDA", name: "old-a" } } }, events: [archived(10, "old-a")] });
    cleanup.push(() => a.close());
    // B takes the same key, will not read its log from 0 (410 below 800) and knows no project old-a.
    const b = await createLoopsStub({ ...base, key: a.key, events: [envelope(900, "ticket.created")], logMinAfter: 800 });
    cleanup.push(() => b.close());
    // The proxy in front of A: the read of /api/projects/old-a, the last one before the assembly reports, is answered
    // only after `release()`; every other request passes through, and A going away ends the stream behind it.
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let held = 0;
    const proxy: Server = createServer((req, res) => {
      const ahead = request(`${a.url}${req.url}`, { method: req.method, headers: req.headers }, (answer) => {
        if (req.url?.startsWith("/api/projects/old-a")) {
          // Taken whole at once and given later, so A's going away cannot cut it.
          const chunks: Buffer[] = [];
          answer.on("data", (chunk: Buffer) => chunks.push(chunk));
          answer.on("end", () => {
            held += 1;
            void gate.then(() => {
              res.writeHead(answer.statusCode ?? 502, answer.headers);
              res.end(Buffer.concat(chunks));
            });
          });
          return;
        }
        res.writeHead(answer.statusCode ?? 502, answer.headers).flushHeaders();
        answer.pipe(res);
        answer.on("close", () => res.destroy());
      });
      ahead.on("error", () => res.destroy());
      req.pipe(ahead);
    });
    await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
    cleanup.push(
      () =>
        new Promise<void>((resolve) => {
          release();
          proxy.closeAllConnections();
          proxy.close(() => resolve());
        }),
    );
    const proxyPort = (proxy.address() as AddressInfo).port;
    const appData = mkdtempSync(path.join(tmpdir(), "chw-app-"));
    cleanup.push(() => rmSync(appData, { recursive: true, force: true }));
    mkdirSync(path.join(appData, "run"));
    const settings = path.join(appData, "settings.json");
    writeFileSync(settings, `{"port": ${proxyPort}}\n`);
    const dir = mkdtempSync(path.join(tmpdir(), "chw-memory-"));
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    const store = createArchiveStore(path.join(dir, "crewhub-world"));
    const lines: string[] = [];
    const host = await testHost({ discovery: { appData, intervalMs: 40 }, key: a.key, keyName: "crewhub-world", keySource: "env", archiveStore: store, log: (line) => lines.push(line), pairing: "off", retryMs: { min: 20, max: 100 }, reconnectMs: { min: 20, max: 100 } });
    cleanup.push(() => host.close());
    const health = async () => (await (await fetch(`${host.url}/world-api/health`)).json()) as Record<string, any>;
    await waitFor("A's stream", async () => (await health()).connection.stream.state === "ok");
    const first = fetch(`${host.url}/world-api/snapshot`).catch(() => null); // A's assembly, held at the read before its report.
    await waitFor("A's last read before the report", () => held > 0, 20_000);
    assert.equal(existsSync(store.file), false, "nothing saved yet");
    // The switch: settings.json names B, A goes away, discovery finds B and B's stream comes up; A's assembly still waits.
    writeFileSync(settings, `{"port": ${b.port}}\n`);
    await a.close();
    await waitFor("discovery to find B", async () => (await health()).connection.discovery?.target === b.url, 20_000);
    await waitFor("B's stream", async () => (await health()).connection.stream.state === "ok", 20_000);
    release();
    await first; // A's assembly ends and reports, through the handle of a link that is gone.
    const h = await health();
    const file = existsSync(store.file) ? (JSON.parse(readFileSync(store.file, "utf8")) as { slugs: string[]; target?: string }) : null;
    assert.ok(!(file?.target === b.url && file.slugs.includes("old-a")), `A's slug written under B's name: ${JSON.stringify(file)}`);
    assert.ok(!h.connection.archived.slugs?.includes("old-a"), `A's slug in B's memory: ${JSON.stringify(h.connection.archived)}`);
    assert.ok(lines.some((line) => line.startsWith("archive report of a link that is gone (")), `the host says it dropped A's report: ${lines.filter((line) => /archive/.test(line)).join(" | ")}`);
  });
});

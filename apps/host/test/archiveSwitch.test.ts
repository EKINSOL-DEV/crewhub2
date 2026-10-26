/**
 * The archive memory when discovery switches loops mid-run (round 44). Loops A tells its whole log (one archived
 * project of its own); A goes away and the app data folder's settings.json names B, a loops that will not read its log
 * from the start and lists nothing. A's remembered slug must not reach B's `archived.json`: B's first snapshot confirms
 * it with B, which does not know it, and drops it; B's own archive event then enters B's file alone. Everything on
 * 127.0.0.1 port 0 and temp folders.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { createArchiveStore } from "../src/archiveStore.ts";
import { createHost } from "../src/host.ts";
import { createLoopsStub, envelope, installation } from "./loopsStub.ts";
import { waitFor } from "./wait.ts";

function archived(seq: number, slug: string) {
  return envelope(seq, "project.archived", { project: { slug, key: slug.toUpperCase() }, actor: { id: "nicky", kind: "user" }, payload: { changed: ["archivedAt"], old: {}, new: { archivedAt: "2026-10-26T00:00:00.000Z" } } });
}

describe("the archive memory across a switch of the loops found (round 44)", () => {
  const cleanup: (() => Promise<void> | void)[] = [];
  afterEach(async () => {
    for (const fn of cleanup.reverse()) await fn();
    cleanup.length = 0;
  });

  it("loops A's remembered slug never enters loops B's file; B's first snapshot drops it and B's own event enters alone", async () => {
    const base = installation();
    const old = base.routes["/api/projects/old"] as { project: Record<string, unknown> };
    const a = await createLoopsStub({ ...base, routes: { ...base.routes, "/api/projects/old-a": { project: { ...old.project, id: "pr_old-a", slug: "old-a", key: "OLDA", name: "old-a" } } }, events: [archived(1, "old-a")] });
    cleanup.push(() => a.close());
    // B takes the same key, will not read its log from 0 (410 below 800) and knows no project old-a.
    const b = await createLoopsStub({ ...base, key: a.key, events: [envelope(900, "ticket.created")], logMinAfter: 800 });
    cleanup.push(() => b.close());
    const appData = mkdtempSync(path.join(tmpdir(), "chw-app-"));
    cleanup.push(() => rmSync(appData, { recursive: true, force: true }));
    mkdirSync(path.join(appData, "run"));
    const settings = path.join(appData, "settings.json");
    writeFileSync(settings, `{"port": ${a.port}}\n`);
    const dir = mkdtempSync(path.join(tmpdir(), "chw-memory-"));
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    const store = createArchiveStore(path.join(dir, "crewhub-world"));
    const host = await createHost({ discovery: { appData, intervalMs: 40 }, key: a.key, keyName: "crewhub-world", keySource: "env", archiveStore: store, pairing: "off", retryMs: { min: 20, max: 100 }, reconnectMs: { min: 20, max: 100 } });
    cleanup.push(() => host.close());
    const health = async () => (await (await fetch(`${host.url}/world-api/health`)).json()) as Record<string, any>;
    const snapshot = async () => (await (await fetch(`${host.url}/world-api/snapshot`)).json()) as Record<string, any>;
    const file = () => JSON.parse(readFileSync(store.file, "utf8")) as { slugs: string[]; target?: string };

    await waitFor("A's stream", async () => (await health()).connection.stream.state === "ok");
    await snapshot();
    assert.deepEqual([file().slugs, file().target, (await health()).connection.archived.slugs], [["old-a"], a.url, ["old-a"]], "A's whole log taught old-a, written for A");

    // The switch: A goes away, the folder names B, discovery looks again and finds B.
    writeFileSync(settings, `{"port": ${b.port}}\n`);
    await a.close();
    await waitFor("discovery to find B", async () => (await health()).connection.discovery?.target === b.url, 20_000);
    await waitFor("B's stream", async () => (await health()).connection.stream.state === "ok");
    const body = await snapshot();
    assert.deepEqual(body.archivedProjects, [], "B does not know old-a: confirmed with B and dropped");
    assert.deepEqual((await health()).connection.archived.slugs, [], "nothing of A's left in memory after B's first snapshot");
    assert.deepEqual([file().slugs, file().target], [[], b.url], "B's file holds B's set, which is empty, never A's slug");
    assert.ok(!b.requests.some((r) => r.path === "/api/projects/old-a" && r.method !== "GET"), "A's slug was only asked about, never written to B");

    b.emit(archived(901, "beacon"));
    await waitFor("B's event to enter B's file", () => file().slugs.includes("beacon"));
    assert.deepEqual([file().slugs, file().target], [["beacon"], b.url], "B's own set alone");
    assert.deepEqual((await health()).connection.archived.slugs, ["beacon"]);
  });
});

/**
 * The host remembers the closed buildings it learnt (spec addendum "closed buildings", round 3): what the event log
 * or the stream taught goes to `archived.json` in its folder, so a loops that will not read its log from the start
 * (the fake after a restart answers 410) still shows them on the next start, confirmed one by one with loops. The
 * health says where the list came from. A restored project leaves the file. Everything on 127.0.0.1 port 0 and a
 * temp folder.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { type ArchiveStore, createArchiveStore } from "../src/archiveStore.ts";
import { type HostOptions, createHost } from "../src/host.ts";
import { type LoopsStub, createLoopsStub, envelope, installation } from "./loopsStub.ts";
import { waitFor } from "./wait.ts";


function change(seq: number, type: "project.archived" | "project.restored", slug: string) {
  return envelope(seq, type, { project: { slug, key: slug.toUpperCase() }, actor: { id: "nicky", kind: "user" }, payload: { changed: ["archivedAt"], old: {}, new: { archivedAt: type === "project.archived" ? "2026-10-20T22:14:27Z" : null } } });
}

describe("the archive memory", () => {
  const cleanup: (() => Promise<void> | void)[] = [];
  afterEach(async () => {
    for (const fn of cleanup.reverse()) await fn();
    cleanup.length = 0;
  });

  function folder(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "chw-memory-"));
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    return path.join(dir, "crewhub-world");
  }

  async function startHost(stub: LoopsStub, archiveStore: ArchiveStore, extra: Partial<HostOptions> = {}) {
    const lines: string[] = [];
    const host = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", keySource: "env", archiveStore, pairing: "off", retryMs: { min: 20, max: 100 }, reconnectMs: { min: 10, max: 20 }, log: (line) => lines.push(line), ...extra });
    cleanup.push(() => host.close());
    const health = async () => (await (await fetch(`${host.url}/world-api/health`)).json()) as Record<string, any>;
    const snapshot = async () => (await (await fetch(`${host.url}/world-api/snapshot`)).json()) as Record<string, any>;
    await waitFor("the stream", async () => (await health()).connection.stream.state === "ok");
    return { host, lines, health, snapshot };
  }

  it("writes what the log taught to archived.json (0600, whole) and says the list came from the log", async () => {
    const stub = await createLoopsStub({ ...installation(), events: [change(1, "project.archived", "old"), envelope(2, "ticket.created")] });
    cleanup.push(() => stub.close());
    const store = createArchiveStore(folder());
    const { health, snapshot, lines } = await startHost(stub, store);
    assert.deepEqual((await health()).connection.archived, { source: "none", count: 0, slugs: [] }, "nothing known before the first snapshot");
    const body = await snapshot();
    assert.deepEqual(body.archivedProjects.map((p: { slug: string }) => p.slug), ["old"]);
    const archived = (await health()).connection.archived;
    assert.equal(archived.source, "log");
    assert.equal(archived.count, 1);
    assert.deepEqual(archived.slugs, ["old"]);
    assert.ok(typeof archived.at === "string" && !Number.isNaN(Date.parse(archived.at)));
    assert.equal(statSync(store.file).mode & 0o777, 0o600);
    const file = JSON.parse(readFileSync(store.file, "utf8"));
    assert.deepEqual(file.slugs, ["old"]);
    assert.equal(file.target, stub.url);
    assert.ok(lines.some((l) => /remembered 1 archived project in/.test(l)), lines.join("\n"));
    await snapshot();
    assert.equal(JSON.parse(readFileSync(store.file, "utf8")).at, file.at, "an unchanged set is not written again");
  });

  it("shows the remembered closed buildings on the next start when loops will not read its log from 0, and says so", async () => {
    const first = await createLoopsStub({ ...installation(), events: [change(1, "project.archived", "old")] });
    cleanup.push(() => first.close());
    const store = createArchiveStore(folder());
    const a = await startHost(first, store);
    await a.snapshot();
    await a.host.close();

    // The next run, against a loops whose log starts above 0 (the fake after a restart: 410 for after=0).
    const second = await createLoopsStub({ ...installation(), events: [envelope(900, "ticket.created")], logMinAfter: 800 });
    cleanup.push(() => second.close());
    const b = await startHost(second, store);
    assert.deepEqual((await b.health()).connection.archived, { source: "remembered", count: 1, at: JSON.parse(readFileSync(store.file, "utf8")).at, slugs: ["old"] }, "known from the file before any snapshot");
    assert.ok(b.lines.some((l) => /remembered 1 archived project from/.test(l)), b.lines.join("\n"));
    const body = await b.snapshot();
    assert.deepEqual(body.archivedProjects.map((p: { slug: string }) => p.slug), ["old"], "confirmed with GET /api/projects/old and shown");
    assert.equal((await b.health()).connection.archived.source, "remembered");
    assert.ok(second.requests.some((r) => r.path === "/api/projects/old"));
    const bare = (await (await fetch(`${b.host.url}/world-api/health`)).json()) as Record<string, any>;
    assert.ok(Array.isArray(bare.connection.archived.slugs), "pairing off: every request is paired and sees the slugs");

    // Without a memory the same loops shows nothing closed, and the health says none.
    const c = await startHost(second, createArchiveStore(folder()));
    assert.deepEqual((await c.snapshot()).archivedProjects, []);
    assert.equal((await c.health()).connection.archived.source, "none");
  });

  it("a restore on the stream leaves the file, an archive on the stream enters it; a remembered slug loops no longer calls archived is dropped", async () => {
    const stub = await createLoopsStub({ ...installation(), events: [change(1, "project.archived", "old")] });
    cleanup.push(() => stub.close());
    const store = createArchiveStore(folder());
    const { health, snapshot } = await startHost(stub, store);
    await snapshot();
    assert.deepEqual(JSON.parse(readFileSync(store.file, "utf8")).slugs, ["old"]);
    stub.emit(change(2, "project.restored", "old"));
    await waitFor("the restore to leave the file", () => JSON.parse(readFileSync(store.file, "utf8")).slugs.length === 0);
    assert.equal((await health()).connection.archived.count, 0);
    stub.emit(change(3, "project.archived", "beacon"));
    await waitFor("the archive to enter the file", () => JSON.parse(readFileSync(store.file, "utf8")).slugs.join() === "beacon");
    assert.deepEqual((await health()).connection.archived.slugs, ["beacon"]);

    // A stale memory: the file names a project loops says is active now. The snapshot checks and drops it.
    store.save({ slugs: ["atlas", "old"], at: "2026-10-21T00:00:00.000Z" });
    const other = await createLoopsStub({ ...installation(), events: [envelope(900, "ticket.created")], logMinAfter: 800 });
    cleanup.push(() => other.close());
    const b = await startHost(other, store);
    assert.equal((await b.health()).connection.archived.count, 2, "remembered as the file says, until loops is asked");
    assert.deepEqual((await b.snapshot()).archivedProjects.map((p: { slug: string }) => p.slug), ["old"], "atlas is active: not a closed building");
    assert.deepEqual(JSON.parse(readFileSync(store.file, "utf8")).slugs, ["old"], "the file follows what loops confirmed");
  });
});

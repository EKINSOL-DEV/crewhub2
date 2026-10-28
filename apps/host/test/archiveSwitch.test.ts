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

    // The switch: A goes away, the folder names B, discovery looks again and finds B. From the moment discovery names B
    // until B's stream is up, a sampler reads the health and the file (round 45): nothing of A's may show under B, and
    // B's file may not be written before B taught its own set.
    const samples: { archived: { source: string; slugs: string[] }; file: { slugs: string[]; target?: string } }[] = [];
    let sampling = true;
    const sampler = (async () => {
      while (sampling) {
        const h = await health().catch(() => null);
        if (h?.connection?.discovery?.target === b.url) samples.push({ archived: h.connection.archived, file: file() });
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    })();
    cleanup.push(() => {
      sampling = false;
    });
    writeFileSync(settings, `{"port": ${b.port}}\n`);
    await a.close();
    try {
      await waitFor("discovery to find B", async () => (await health()).connection.discovery?.target === b.url, 20_000);
      const atSwitch = await health();
      assert.deepEqual(atSwitch.connection.archived.slugs, [], "right after discovery finds B: no slug of A's under B");
      await waitFor("B's stream", async () => (await health()).connection.stream.state === "ok");
    } finally {
      sampling = false;
      await sampler;
    }
    assert.ok(samples.length > 0, "the switch was sampled");
    for (const s of samples) {
      assert.ok(!s.archived.slugs.includes("old-a"), `A's slug shown under B: ${JSON.stringify(s.archived)}`);
      if (s.file.target === b.url) assert.notEqual(s.archived.source, "none", `B's file written (${JSON.stringify(s.file)}) while B's set is not learnt`);
      assert.ok(!(s.file.target === b.url && s.file.slugs.includes("old-a")), "A's slug written into B's file");
    }
    const body = await snapshot();
    assert.deepEqual(body.archivedProjects, [], "B does not know old-a: confirmed with B and dropped");
    assert.deepEqual((await health()).connection.archived.slugs, [], "nothing of A's left in memory after B's first snapshot");
    // B has not taught its own set yet (it lists nothing and will not read its log from the start), so B's file is not
    // written: A's memory stays on disk, under A's name, until B teaches its set below (round 45).
    assert.deepEqual([file().slugs, file().target], [["old-a"], a.url], "B's file is not written while B's set is not learnt; A's stays on disk under A's name");
    assert.ok(!b.requests.some((r) => r.path === "/api/projects/old-a" && r.method !== "GET"), "A's slug was only asked about, never written to B");

    b.emit(archived(901, "beacon"));
    await waitFor("B's event to enter B's file", () => file().slugs.includes("beacon"));
    assert.deepEqual([file().slugs, file().target], [["beacon"], b.url], "B's own set alone");
    assert.deepEqual((await health()).connection.archived.slugs, ["beacon"]);
  });

  // Round 47 (the review's F1): the host read the file once at its start, so a loops found again was judged by the file
  // as it was then. Here A teaches a slug after the start, discovery goes to B and back: A's memory is the file as it
  // stands now (both slugs, the time of the last save); and once B has written the file, A finds B's memory, not A's
  // startup slugs under "remembered".
  it("a loops found again is judged by the file as it stands, not as it was when the host started", async () => {
    const base = installation();
    const old = base.routes["/api/projects/old"] as { project: Record<string, unknown> };
    const project = (slug: string) => ({ project: { ...old.project, id: `pr_${slug}`, slug, key: slug.toUpperCase().replace("-", ""), name: slug } });
    // A knows both its archived projects; neither A nor B reads its log from the start or lists anything.
    const aOptions = { ...base, routes: { ...base.routes, "/api/projects/old-a": project("old-a"), "/api/projects/new-a": project("new-a") }, events: [envelope(900, "ticket.created")], logMinAfter: 800 };
    let a = await createLoopsStub(aOptions);
    const key = a.key, aPort = a.port, aUrl = a.url;
    const bOptions = { ...base, key, events: [envelope(900, "ticket.created")], logMinAfter: 800 };
    let b = await createLoopsStub(bOptions);
    const bPort = b.port, bUrl = b.url;
    cleanup.push(() => a.close(), () => b.close());
    const appData = mkdtempSync(path.join(tmpdir(), "chw-app-"));
    cleanup.push(() => rmSync(appData, { recursive: true, force: true }));
    mkdirSync(path.join(appData, "run"));
    const settings = path.join(appData, "settings.json");
    writeFileSync(settings, `{"port": ${aPort}}\n`);
    const dir = mkdtempSync(path.join(tmpdir(), "chw-memory-"));
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    const store = createArchiveStore(path.join(dir, "crewhub-world"));
    // The file at the host's start: A's, with one slug.
    store.save({ slugs: ["old-a"], at: "2026-10-27T00:00:00.000Z", target: aUrl });
    const host = await createHost({ discovery: { appData, intervalMs: 40 }, key, keyName: "crewhub-world", keySource: "env", archiveStore: store, pairing: "off", retryMs: { min: 20, max: 100 }, reconnectMs: { min: 20, max: 100 } });
    cleanup.push(() => host.close());
    const health = async () => (await (await fetch(`${host.url}/world-api/health`)).json()) as Record<string, any>;
    const file = () => JSON.parse(readFileSync(store.file, "utf8")) as { slugs: string[]; at: string; target?: string };
    /** Discovery to the stub on `port` (opened by `open`), the one on the other port closed. */
    const switchTo = async (what: string, port: number, url: string, close: () => Promise<void>) => {
      writeFileSync(settings, `{"port": ${port}}\n`);
      await close();
      await waitFor(`discovery to find ${what}`, async () => (await health()).connection.discovery?.target === url, 20_000);
      const atSwitch = (await health()).connection.archived;
      await waitFor(`${what}'s stream`, async () => (await health()).connection.stream.state === "ok");
      await fetch(`${host.url}/world-api/snapshot`);
      return atSwitch as { source: string; slugs: string[]; at?: string };
    };

    await waitFor("A's stream", async () => (await health()).connection.stream.state === "ok");
    await fetch(`${host.url}/world-api/snapshot`);
    a.emit(archived(901, "new-a"));
    await waitFor("A's event to enter A's file", () => file().slugs.includes("new-a"));
    const learntAt = file().at;
    assert.deepEqual([file().slugs, file().target], [["new-a", "old-a"], aUrl], "A taught new-a after the start");

    // A → B: B teaches nothing, so the file stays A's.
    await switchTo("B", bPort, bUrl, () => a.close());
    assert.deepEqual((await health()).connection.archived.slugs, [], "nothing of A's under B");
    assert.deepEqual([file().slugs, file().target], [["new-a", "old-a"], aUrl], "B wrote nothing");

    // B → A: A's memory is the file as it stands now, both slugs, learnt when new-a was saved.
    a = await createLoopsStub({ ...aOptions, key, port: aPort });
    const back = await switchTo("A again", aPort, aUrl, () => b.close());
    assert.deepEqual([back.source, back.slugs, back.at], ["remembered", ["new-a", "old-a"], learntAt], "right after discovery finds A again: the file as it stands, not the startup's old-a alone");
    assert.deepEqual((await health()).connection.archived.slugs, ["new-a", "old-a"], "A's first snapshot confirms both");

    // A → B, B's own archive event writes the file under B; then B → A: A finds B's memory and ignores it.
    b = await createLoopsStub({ ...bOptions, key, port: bPort });
    await switchTo("B again", bPort, bUrl, () => a.close());
    b.emit(archived(901, "beacon"));
    await waitFor("B's event to enter B's file", () => file().target === bUrl);
    a = await createLoopsStub({ ...aOptions, key, port: aPort });
    const last = await switchTo("A a third time", aPort, aUrl, () => b.close());
    assert.deepEqual([last.source, last.slugs], ["none", []], "the file is B's now: nothing remembered for A, and never the startup's old-a");
    assert.deepEqual((await health()).connection.archived.slugs, [], "still nothing after A's first snapshot (A teaches no set)");
    assert.deepEqual([file().slugs, file().target], [["beacon"], bUrl], "B's file stays until A teaches its own set");
  });
});

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { LoopsSnapshot } from "@crewhub/loops-client";
import { createHost, type Host } from "../src/host.ts";
import { type LoopsStub, createLoopsStub, envelope, installation } from "./loopsStub.ts";

describe("snapshot assembly", () => {
  let stub: LoopsStub;
  let host: Host;
  before(async () => {
    stub = await createLoopsStub({ ...installation(), events: [envelope(40, "ticket.created")] });
    host = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", retryMs: { min: 20, max: 100 } });
    await fetch(`${host.url}/world-api/health`);
    stub.emit({ type: "project.archived", project: { slug: "old", key: "OLD" }, ticket: null, actor: { id: "nicky", kind: "user" }, recipientIds: [], payload: {} });
    for (let i = 0; i < 50; i += 1) {
      const health = (await (await fetch(`${host.url}/world-api/health`)).json()) as { cursor?: number };
      if (health.cursor === 41) break;
      await new Promise((r) => setTimeout(r, 20));
    }
  });
  after(async () => {
    await host.close();
    await stub.close();
  });

  it("follows read-model.md 'Loading a snapshot' and pages every list", async () => {
    const res = await fetch(`${host.url}/world-api/snapshot`);
    assert.equal(res.status, 200);
    const snapshot = (await res.json()) as LoopsSnapshot;
    assert.equal(snapshot.cursor, 41, "the cursor is the stream position before the reads");
    assert.deepEqual(snapshot.projects.map((p) => p.slug), ["atlas", "beacon"]);
    assert.deepEqual(snapshot.archivedProjects.map((p) => p.slug), ["old"], "an archived project the host saw archived is read one by one");
    assert.deepEqual(Object.keys(snapshot.boards).sort(), ["atlas", "beacon"]);
    assert.equal(snapshot.boards.atlas?.columns.length, 5);
    assert.deepEqual(Object.keys(snapshot.milestones), ["atlas"], "milestones only where the feature is on");
    assert.deepEqual(snapshot.milestones.atlas?.map((m) => m.key), ["AT-M1", "AT-M2", "AT-M3"], "both pages");
    assert.deepEqual(snapshot.releases, {}, "a 409 feature_off is no release list");
    assert.equal(snapshot.principals.length, 2);
    assert.equal(snapshot.agents[0]?.isCrewhubLead, true);
    assert.equal(snapshot.team.ts, "2026-10-07T10:00:00Z");
    assert.equal(snapshot.watchdog.mode, "observe");
    assert.deepEqual(snapshot.groups, []);
    const paths = stub.requests.map((r) => r.path);
    assert.ok(paths.includes("/api/projects?includeArchived=true") && paths.includes("/api/projects"), "falls back when includeArchived is refused");
    assert.ok(paths.includes("/api/projects/atlas/milestones?cursor=page-1"));
    assert.ok(!paths.some((p) => p.startsWith("/api/projects/beacon/milestones")), "no milestones read for a project with the feature off");
    assert.ok(stub.requests.every((r) => r.method === "GET"));
  });

  it("answers 503 unauthorized when the key is refused", async () => {
    const wrong = await createLoopsStub(installation());
    const other = await createHost({ loopsUrl: wrong.url, key: "chl_not_the_key", keyName: "crewhub-world", retryMs: { min: 20, max: 100 } });
    try {
      const res = await fetch(`${other.url}/world-api/snapshot`);
      assert.equal(res.status, 503);
      assert.deepEqual(await res.json(), { error: "unauthorized" });
    } finally {
      await other.close();
      await wrong.close();
    }
  });
});

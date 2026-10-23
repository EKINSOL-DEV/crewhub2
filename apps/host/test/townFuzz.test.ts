/* Round 34: the town the host is handed, under fuzz. Three roads bring bytes from outside into the world database:
   `PUT /world-api/town` from a paired browser (the body, `readJsonBody` and the route's checks, then
   `validateTownForHost`), and the rows of `world.db` itself when the file was edited or damaged by hand (`historyOf`
   rebuilds a history from the row). Seeded, a few thousand inputs: broken copies of a whole document, bodies that are
   not JSON or not an object, duplicate and prototype keys, odd base revisions and ops, one body over the limit, rows
   of any shape. What a caller sees: the documented statuses and error codes (400 validation_error, 403
   origin_required, 415 unsupported_media_type, 409 town_conflict, 200 with the revision one up), never a 500, the
   stored town always a valid document, and for the rows a read and a move that answer instead of throwing. */
import assert from "node:assert/strict";
import { emptyTownDocument, validateTownDocument, type TownDocument } from "@crewhub/world-model";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, it } from "node:test";
import { createHost, type Host } from "../src/host.ts";
import { TOWN_BODY_LIMIT, installationKey, openWorldDb, validateTownForHost, type WorldDb } from "../src/worldDb.ts";
import { createLoopsStub, installation, type LoopsStub } from "./loopsStub.ts";
import { waitFor } from "./wait.ts";
import { Fuzz, PROTO_KEYS, protoSnapshot, replay } from "../../../packages/world-engine/test/fuzz.ts";

const SEEDS = [34_051, 34_052, 34_053];
const UUID = (n: number) => `6f1c0d3e-2b4a-4c6d-8e9f-${String(n).padStart(12, "0")}`;
/** A whole document with every optional key, at revision `n`. */
const DOC = (n: number): TownDocument =>
  ({
    ...emptyTownDocument("greenhouse"),
    revision: n,
    castId: "robots",
    styleOptions: { season: "summer" },
    plots: [{ slug: "crewhub", cell: { x: 2, z: 3 }, zoneId: "zone-1" }],
    zones: [{ id: "zone-1", name: "Zone 1", order: 0, color: "coral", emblem: "home" }],
    assignments: { atlas: "zone-1" },
    districts: [{ zoneId: "zone-1", slot: { x: 0, z: 0 } }],
    placements: [{ id: UUID(1), propId: "builtin:desk", at: { building: "crewhub", room: "lobby" }, cell: { x: 1, z: 1 }, rotation: 1 }],
  }) as TownDocument;

describe("round 34 fuzz: the town the host is handed", () => {
  let stub: LoopsStub | null = null;
  let host: Host | null = null;
  let db: WorldDb | null = null;
  let dir = "";
  afterEach(async () => {
    await host?.close();
    await stub?.close();
    db?.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
    host = stub = db = null;
    dir = "";
  });

  it("validateTownForHost: broken copies of a whole document never throw; what it keeps the browsers would keep too; a refusal names a path", () => {
    const before = protoSnapshot();
    let accepted = 0;
    for (const seed of SEEDS) {
      const f = new Fuzz(seed);
      for (let i = 0; i < 700; i += 1) {
        const input = f.mutate(DOC(1), f.int(1, 4));
        let verdict;
        try {
          verdict = validateTownForHost(input);
        } catch (error) {
          assert.fail(`${replay(seed, i, input)} threw ${String(error)}`);
        }
        if (verdict.ok) {
          accepted += 1;
          const doc = input as TownDocument;
          // The browser's own check over the same registries the host assumed (the document's style, the builtin ids it names).
          assert.ok(validateTownDocument(input, { knownStyles: [doc.styleId], builtinIds: doc.placements.map((p) => p.propId).filter((id) => id.startsWith("builtin:")) }).ok, replay(seed, i));
        } else assert.match(verdict.reason, /^[^:]+: .+/, replay(seed, i, verdict.reason));
      }
    }
    assert.ok(accepted > 20, `some broken copies are still whole documents: ${accepted}`);
    for (const v of [null, undefined, 1, "x", [], true]) assert.ok(!validateTownForHost(v).ok, String(v));
    assert.equal(protoSnapshot(), before);
  });

  it("PUT /world-api/town with any body: a documented status and error code, never a 500; the stored town valid; the revision one up per accepted write", async () => {
    const before = protoSnapshot();
    stub = await createLoopsStub(installation());
    dir = mkdtempSync(path.join(tmpdir(), "chw-townfuzz-"));
    db = openWorldDb(dir);
    host = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", keySource: "env", pairing: "off", retryMs: { min: 20, max: 100 }, worldDb: db });
    await waitFor("the stream", async () => ((await (await fetch(`${host!.url}/world-api/health`)).json()) as { connection: { stream: { state: string } } }).connection.stream.state === "ok");
    const put = (body: string, headers: Record<string, string>) => fetch(`${host!.url}/world-api/town`, { method: "PUT", headers, body });
    const read = async () => (await (await fetch(`${host!.url}/world-api/town`)).json()) as { rev: number; document: unknown };
    let rev = 0;
    const statuses = new Map<number, number>();
    for (const seed of SEEDS) {
      const f = new Fuzz(seed);
      for (let i = 0; i < 90; i += 1) {
        const op = f.bool(0.75) ? undefined : f.pick(["commit", "amend", "undo", "redo", "merge", "", 7, null]);
        const baseRev = f.bool(0.7) ? rev : f.pick([rev - 1, rev + 1, 0, -1, 1.5, 1e21, "1", null, 2 ** 53]);
        const document = f.bool(0.6) ? DOC(rev + 1) : f.bool(0.5) ? f.mutate(DOC(rev + 1), f.int(1, 3)) : f.value(2);
        const body = f.bool(0.9) ? f.jsonText({ ...(op === undefined ? {} : { op }), document, baseRev }) : f.pick(["", "null", "[]", "1", "{", "x".repeat(2000), "﻿{}"]);
        const headers: Record<string, string> = { origin: host.url, "content-type": "application/json" };
        if (f.bool(0.05)) headers["content-type"] = f.pick(["text/plain", "application/json; charset=utf-8", "APPLICATION/JSON", "", "application/x-www-form-urlencoded"]);
        if (f.bool(0.05)) delete headers["origin"];
        const response = await put(body, headers);
        statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
        assert.ok([200, 400, 403, 409, 415].includes(response.status), `${replay(seed, i, { body: body.slice(0, 200), headers })}: status ${response.status}`);
        const answer = (await response.json()) as Record<string, unknown>;
        if (response.status === 200) {
          assert.ok(typeof answer.rev === "number" && (answer.changed === true ? answer.rev === rev + 1 : answer.rev === rev), replay(seed, i, answer));
          rev = answer.rev as number;
          assert.ok(validateTownForHost(answer.document).ok, `${replay(seed, i)}: the answered town validates`);
        } else {
          assert.equal(answer.error, { 400: "validation_error", 403: "origin_required", 409: "town_conflict", 415: "unsupported_media_type" }[response.status], replay(seed, i, answer));
          assert.ok(typeof answer.message === "string" && answer.message !== "", replay(seed, i, answer));
          if (response.status === 409) assert.equal(answer.rev, rev, replay(seed, i, answer));
        }
        const held = await read();
        assert.equal(held.rev, rev, replay(seed, i));
        if (rev > 0) assert.ok(validateTownForHost(held.document).ok, `${replay(seed, i)}: the stored town validates`);
      }
    }
    assert.ok((statuses.get(200) ?? 0) > 30 && (statuses.get(400) ?? 0) > 30, `the mix: ${JSON.stringify([...statuses])}`);
    assert.equal(statuses.get(500), undefined, "never a 500");
    // One body over the limit: refused as a validation error, the town untouched.
    const huge = JSON.stringify({ document: { ...DOC(rev + 1), zones: [{ id: "z", name: "n".repeat(TOWN_BODY_LIMIT) }] }, baseRev: rev });
    assert.ok(huge.length > TOWN_BODY_LIMIT);
    const over = await put(huge, { origin: host.url, "content-type": "application/json" });
    assert.equal(over.status, 400);
    assert.equal(((await over.json()) as { error: string }).error, "validation_error");
    assert.equal((await read()).rev, rev);
    // Prototype keys in the body and in the document: unknown keys, refused, nothing polluted.
    for (const key of PROTO_KEYS) {
      const r = await put(`{"${key}":{"polluted":1},"document":${JSON.stringify(DOC(rev + 1))},"baseRev":${rev}}`, { origin: host.url, "content-type": "application/json" });
      assert.ok(r.status === 200 || r.status === 400, `${key}: ${r.status}`); // an unknown key beside `document` is ignored by the route; inside the document it is refused
      if (r.status === 200) rev = ((await r.json()) as { rev: number }).rev;
      const inside = await put(`{"document":{"${key}":1,${JSON.stringify(DOC(rev + 1)).slice(1)},"baseRev":${rev}}`, { origin: host.url, "content-type": "application/json" });
      assert.equal(inside.status, 400, `document.${key}`);
    }
    assert.equal(protoSnapshot(), before);
  });

  it("world.db rows of any shape (a file edited or damaged by hand): a read answers with booleans, and a commit, an undo and a redo answer instead of throwing", () => {
    dir = mkdtempSync(path.join(tmpdir(), "chw-rowfuzz-"));
    const store = openWorldDb(dir);
    db = store;
    const raw = new DatabaseSync(path.join(dir, "world.db"));
    const insert = raw.prepare("INSERT OR REPLACE INTO towns (installation, rev, document, history, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)");
    const installationOf = (i: number) => installationKey(`http://127.0.0.1:${8000 + i}`);
    let moved = 0;
    const findings: string[] = [];
    for (const seed of SEEDS) {
      const f = new Fuzz(seed);
      for (let i = 0; i < 120; i += 1) {
        const key = installationOf(i);
        const entries = Array.from({ length: f.int(0, 4) }, (_, k) => (f.bool(0.8) ? DOC(k) : f.mutate(DOC(k), 1)));
        const history = f.bool(0.2) ? f.pick(["", "null", "{", "[]", "{\"entries\":[]}", "{\"entries\":[{}],\"index\":0}"]) : f.jsonText({ entries, index: f.bool(0.7) ? f.int(0, Math.max(0, entries.length - 1)) : f.pick([-1, 99, 1.5, "0", null]) });
        const document = f.bool(0.8) ? JSON.stringify(f.bool(0.8) ? DOC(2) : f.mutate(DOC(2), 1)) : f.pick(["", "null", "{", "[]", "x"]);
        const rev = f.bool(0.9) ? f.int(0, 5) : f.pick([-1, 2 ** 40]);
        insert.run(key, rev, document, f.bool(0.1) ? null : history, "2026-10-23T04:00:00Z", null);
        const where = replay(seed, i, { history: history.slice(0, 120), document: document.slice(0, 60), rev });
        try {
          const held = store.getTown(key);
          assert.ok(held !== null && typeof held.canUndo === "boolean" && typeof held.canRedo === "boolean" && held.rev === rev, where);
          for (const op of [{ kind: "undo" as const }, { kind: "redo" as const }, { kind: "commit" as const, document: JSON.stringify(DOC(9)) }]) {
            const current = store.getTown(key)!.rev;
            const outcome = store.applyTown(key, op, current);
            assert.ok(outcome.ok, where);
            if (outcome.changed) {
              moved += 1;
              assert.equal(outcome.rev, current + 1, where);
              // What a move answers is a document the history code wrote: a JSON object with a numeric revision (a damaged
              // entry's content is the file's, and the browsers validate what they take, review F4); after a commit it is the
              // very town written, valid.
              const after: unknown = typeof outcome.document === "string" ? JSON.parse(outcome.document) : undefined;
              assert.ok(typeof after === "object" && after !== null && !Array.isArray(after) && typeof (after as { revision?: unknown }).revision === "number", `${where}: the document after a ${op.kind} is an object with a revision`);
              if (op.kind === "commit") assert.ok(validateTownForHost(after).ok, `${where}: the document after a commit is the valid town written`);
            }
          }
        } catch (error) {
          findings.push(`${where}: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
        }
      }
    }
    raw.close();
    assert.ok(moved > 100, `moves made: ${moved}`);
    assert.deepEqual(findings, [], `${findings.length} row(s) threw or answered badly:\n${findings.slice(0, 8).join("\n")}`);
  });
});

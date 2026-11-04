/**
 * The snapshot's verdict per read (round 60, H3): the reads are judged in one place (`snapshot.ts`'s reader), and this
 * table pins what each kind of read makes of a refusal or a failure, through the module's interface
 * (`assembleSnapshot`, `readTail`). A 401 or 403 is `unauthorized` wherever the key is refused; anything else a read
 * must have is `loops_down`; the reads that may come up short (the list with the archived projects, the log, a
 * feature's 409, an archived project read one by one) answer without them. Written before the reader was folded and
 * green on both sides of the fold: no verdict changed.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { type LoopsClient, createLoopsClient } from "../src/loops.ts";
import { SnapshotError, assembleSnapshot, readTail } from "../src/snapshot.ts";
import { type LoopsStub, createLoopsStub, envelope, installation } from "./loopsStub.ts";

type Query = Record<string, string>;
type Outcome = "unauthorized" | "loops_down" | "assembles";

/** The stub's client, with the reads `match` picks answering `status` (and no body) instead; `hits` counts them. */
function failing(client: LoopsClient, match: (path: string, query: Query) => boolean, status: number): { client: LoopsClient; hits: () => number } {
  let hits = 0;
  const getJson = async <T>(path: string, query: Query = {}): Promise<{ status: number; body: T | null }> => {
    if (!match(path, query)) return client.getJson<T>(path, query);
    hits += 1;
    return { status, body: null };
  };
  return { client: { ...client, getJson }, hits: () => hits };
}

const outcome = async (run: () => Promise<unknown>): Promise<Outcome> => {
  try {
    await run();
    return "assembles";
  } catch (error) {
    if (error instanceof SnapshotError) return error.reason;
    throw error;
  }
};

const archiveRead = (path: string, q: Query) => path === "/api/events" && q.types === "project.archived,project.restored";
const logRead = (path: string, q: Query) => path === "/api/events" && (q.types ?? "").includes("ticket.quiet");

const CASES: [string, (path: string, q: Query) => boolean, number, Outcome][] = [
  ["the list with the archived projects, 401", (p, q) => p === "/api/projects" && q.includeArchived === "true", 401, "unauthorized"],
  ["the list with the archived projects, 403 (an agent key: the list without them)", (p, q) => p === "/api/projects" && q.includeArchived === "true", 403, "assembles"],
  ["the list with the archived projects, 500 (the list without them)", (p, q) => p === "/api/projects" && q.includeArchived === "true", 500, "assembles"],
  ["the list, 403", (p, q) => p === "/api/projects" && q.includeArchived === undefined, 403, "unauthorized"],
  ["the list, 500", (p, q) => p === "/api/projects" && q.includeArchived === undefined, 500, "loops_down"],
  ["the log's archive read, 403", archiveRead, 403, "unauthorized"],
  ["the log's archive read, 410 (the host's memory fills in)", archiveRead, 410, "assembles"],
  ["an archived project read one by one, 403 (left out)", (p) => p === "/api/projects/old", 403, "assembles"],
  ["a board, 401", (p) => p === "/api/board/atlas", 401, "unauthorized"],
  ["a board, 404", (p) => p === "/api/board/atlas", 404, "loops_down"],
  ["a board, 200 that is no JSON", (p) => p === "/api/board/atlas", 200, "loops_down"],
  ["a project's features, 403", (p) => p === "/api/projects/beacon/features", 403, "unauthorized"],
  ["a feature's first page, 403", (p, q) => p === "/api/projects/atlas/milestones" && q.cursor === undefined, 403, "unauthorized"],
  ["a feature's first page, 500", (p, q) => p === "/api/projects/atlas/milestones" && q.cursor === undefined, 500, "loops_down"],
  ["a feature's first page, 200 that is no JSON", (p, q) => p === "/api/projects/atlas/milestones" && q.cursor === undefined, 200, "loops_down"],
  ["a feature's first page, 409 (the feature is off)", (p, q) => p === "/api/projects/atlas/milestones" && q.cursor === undefined, 409, "assembles"],
  ["a feature's next page, 403", (p, q) => p === "/api/projects/atlas/milestones" && q.cursor !== undefined, 403, "unauthorized"],
  ["a feature's next page, 502", (p, q) => p === "/api/projects/atlas/milestones" && q.cursor !== undefined, 502, "loops_down"],
  ["the log's facts read, 403", logRead, 403, "unauthorized"],
  ["the log's facts read, 500 (no quiet, no runs)", logRead, 500, "assembles"],
  ["a quiet ticket's activity, 403", (p, q) => p === "/api/events" && q.ticket !== undefined, 403, "unauthorized"],
  ["a quiet ticket's activity, 500 (the paged read decides)", (p, q) => p === "/api/events" && q.ticket !== undefined, 500, "assembles"],
  ["the people, 403", (p) => p === "/api/principals", 403, "unauthorized"],
  ["the watchdog, 503", (p) => p === "/api/watchdog", 503, "loops_down"],
];

describe("the snapshot's verdict per read (round 60, H3)", () => {
  let stub: LoopsStub;
  before(async () => {
    const quiet = envelope(39, "ticket.quiet", { ticket: { id: "tk_AT", key: "AT-1", title: "First" }, actor: { id: "system", kind: "system" }, payload: { status: "in_progress", minutes: 15, since: "2026-10-21T07:00:00Z", ticket: "AT-1" } });
    stub = await createLoopsStub({ ...installation(), events: [quiet, envelope(40, "ticket.created")] });
  });
  after(async () => {
    await stub.close();
  });

  for (const [name, match, status, expected] of CASES) {
    it(`${name}: ${expected}`, async () => {
      const { client, hits } = failing(createLoopsClient(stub.url, stub.key), match, status);
      assert.equal(await outcome(() => assembleSnapshot(client, { cursor: 40, archived: () => ({ slugs: ["old"], remembered: true }) })), expected);
      assert.ok(hits() > 0, "the read was made");
    });
  }

  for (const [status, expected] of [[401, "unauthorized"], [403, "unauthorized"], [500, "loops_down"]] as const) {
    it(`the tail, ${status}: ${expected}`, async () => {
      const { client, hits } = failing(createLoopsClient(stub.url, stub.key), (p, q) => p === "/api/events" && q.from === "tail", status);
      assert.equal(await outcome(() => readTail(client)), expected);
      assert.equal(hits(), 1);
    });
  }
});

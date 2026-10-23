/**
 * Fuzz (round 34): the transport's and the client's handling of what comes back from loops' URL: any status, a body
 * that is not JSON, not UTF-8, empty, huge, cut off, a redirect, the key echoed; the key check's and the tail's
 * reading of such answers; a passthrough through the host. Over a server of the test's own on 127.0.0.1 port 0.
 * Seeded; a failing input prints its seed. What a caller sees: a resolved read with the status and the scrubbed text,
 * or a rejection for a redirect or a cut connection, never anything else; `getJson` with the parsed body or null;
 * the key check's three verdicts and the tail's shape or `SnapshotError`, never another throw; the host forwarding
 * the status (401/403 as 503 unauthorized) and never a 500.
 */
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { createHost, type Host } from "../src/host.ts";
import { checkKey } from "../src/keyCheck.ts";
import { createLoopsClient } from "../src/loops.ts";
import { SnapshotError, readTail } from "../src/snapshot.ts";
import { Rng, assertPrototypeClean, oddJsonText, oddString, oddValue, replay } from "./fuzz.ts";
import { type LoopsStub, createLoopsStub, installation } from "./loopsStub.ts";

const KEY = "chl_fuzz_transport_key_0123456789";
const STATUSES = [200, 200, 200, 201, 204, 206, 301, 302, 304, 307, 308, 400, 401, 403, 404, 409, 410, 418, 429, 500, 502, 503, 599];

interface Plan {
  status: number;
  contentType: string | undefined;
  body: Buffer;
  mode: "length" | "chunked" | "cut-headers" | "cut-body";
}

function planAnswer(rng: Rng, bodyKind?: number): Plan {
  const status = rng.pick(STATUSES);
  const kind = bodyKind ?? rng.int(0, 9);
  let body: Buffer;
  if (kind <= 3) body = Buffer.from(oddJsonText(rng, { ok: true, principal: oddValue(rng), lastSeq: rng.pick([0, 5, -1, 1.5, 2 ** 53, "7", null]), cursor: oddString(rng, 2), events: rng.pick([[], [1], "x", null]), key: rng.chance(0.3) ? KEY : "none" }), "utf8");
  else if (kind === 4) body = Buffer.from([0xff, 0xfe, 0xc3, 0x28, 0xa0, 0xa1, 0xe2, 0x82, 0x28, 0x00, 0x7b, 0x7d]);
  else if (kind === 5) body = Buffer.alloc(0);
  else if (kind === 6) body = Buffer.from(`﻿{"bom":true}`, "utf8");
  else if (kind === 7) body = Buffer.from(`{"deep":${"[".repeat(500)}${"]".repeat(500)}}`, "utf8");
  else if (kind === 8) body = Buffer.from(`{"big":"${"a".repeat(1_000_000)}","key":"${KEY}"}`, "utf8");
  else body = Buffer.from(oddString(rng, 8), "utf8");
  const mode = rng.chance(0.8) ? (rng.chance(0.5) ? "length" : "chunked") : rng.chance(0.5) ? "cut-headers" : "cut-body";
  return { status, contentType: rng.pick(["application/json", "application/json; charset=utf-8", "text/html", "application/x-ndjson", undefined, oddString(rng, 2, 0) || "x/y"]), body, mode };
}

describe("fuzz: the transport's response handling", () => {
  const plans: Plan[] = [];
  let server: Server;
  let url = "";
  before(async () => {
    server = createServer((_req, res) => {
      const plan = plans.shift() ?? { status: 200, contentType: "application/json", body: Buffer.from("{}"), mode: "length" as const };
      const headers: Record<string, string> = {};
      if (plan.contentType !== undefined) headers["content-type"] = plan.contentType.replace(/[^\t\x20-\x7e]/g, "") || "x/y";
      if (plan.status >= 300 && plan.status < 400) headers["location"] = "/api/agents/lead-1/keys";
      const noBody = plan.status === 204 || plan.status === 304;
      if (plan.mode === "cut-headers") {
        headers["content-length"] = String(plan.body.length + 10);
        res.writeHead(plan.status, headers);
        res.flushHeaders();
        res.socket?.destroy();
        return;
      }
      if (plan.mode === "cut-body" && !noBody && plan.body.length > 2) {
        headers["content-length"] = String(plan.body.length);
        res.writeHead(plan.status, headers);
        res.write(plan.body.subarray(0, Math.floor(plan.body.length / 2)));
        res.socket?.destroy();
        return;
      }
      if (plan.mode === "length" || noBody) headers["content-length"] = String(noBody ? 0 : plan.body.length);
      res.writeHead(plan.status, headers);
      if (noBody) return res.end();
      if (plan.mode === "chunked") {
        res.write(plan.body.subarray(0, Math.ceil(plan.body.length / 3)));
        res.write(plan.body.subarray(Math.ceil(plan.body.length / 3), Math.ceil((2 * plan.body.length) / 3)));
        return res.end(plan.body.subarray(Math.ceil((2 * plan.body.length) / 3)));
      }
      return res.end(plan.body);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("get and getJson: the status and the scrubbed text, or a rejection for a redirect or a cut connection; the body parsed or null; never a throw of another kind", async () => {
    const seed = 34301;
    const rng = new Rng(seed);
    const client = createLoopsClient(url, KEY, { readTimeoutMs: 2000 });
    let resolved = 0;
    let rejected = 0;
    for (let i = 0; i < 160; i += 1) {
      const plan = planAnswer(rng, i % 40 === 0 ? 8 : undefined);
      plans.push(plan);
      // fetch follows (and so, told not to, refuses) these five; a 304 or a 300 is an answer like any other.
      const redirect = [301, 302, 303, 307, 308].includes(plan.status);
      const noBody = plan.status === 204 || plan.status === 304;
      const cut = plan.mode === "cut-headers" || (plan.mode === "cut-body" && !noBody && plan.body.length > 2);
      try {
        const answer = await (i % 2 === 0 ? client.get("/api/health") : client.getJson("/api/health").then((r) => ({ status: r.status, text: r.body === null ? "" : JSON.stringify(r.body), body: r.body })));
        resolved += 1;
        assert.ok(!redirect && !cut, `${replay(seed, i, { ...plan, body: plan.body.length })}: resolved where a rejection was due`);
        assert.equal(answer.status, plan.status, replay(seed, i, plan.status));
        assert.ok(!answer.text.includes(KEY), `${replay(seed, i, plan.status)}: the key in the text`);
        if (plan.body.includes(KEY) && !noBody) assert.ok(answer.text.includes("[redacted]"), `${replay(seed, i, plan.status)}: the echoed key not scrubbed`);
        if ("body" in answer) {
          // As fetch decodes it: a UTF-8 byte-order mark is dropped before the text is seen.
          const text = noBody ? "" : plan.body.toString("utf8").replace(/^\ufeff/, "").split(KEY).join("[redacted]");
          let expected: unknown = null;
          try {
            expected = JSON.parse(text);
          } catch {
            expected = null;
          }
          assert.deepEqual(answer.body, expected, `${replay(seed, i, plan.status)}: the parsed body`);
        }
      } catch (error) {
        if (error instanceof assert.AssertionError) throw error;
        rejected += 1;
        assert.ok(redirect || cut, `${replay(seed, i, { ...plan, body: plan.body.length })}: rejected with ${String(error)} (${String((error as { cause?: unknown }).cause)})`);
      }
    }
    assert.ok(resolved > 60 && rejected > 20, `${resolved} resolved, ${rejected} rejected`);
    assert.equal(plans.length, 0, "every planned answer was asked for");
    assertPrototypeClean(seed);
  });

  it("checkKey: a 200 whose principal is null, a number, a list or missing is 'unreachable' with the question whether that is crewhub-loops, never a throw (round 34: null threw)", async () => {
    const client = createLoopsClient(url, KEY, { readTimeoutMs: 2000 });
    for (const body of ['{"principal":null}', '{"principal":5}', '{"principal":[]}', '{"principal":"nicky"}', "{}", "[]", '"x"', "null", '{"principal":{"id":5}}']) {
      plans.push({ status: 200, contentType: "application/json", body: Buffer.from(body, "utf8"), mode: "length" });
      const verdict = await checkKey(client);
      assert.equal(verdict.state, "unreachable", body);
      assert.match((verdict as { reason: string }).reason, /is that crewhub-loops\?$/, body);
    }
    plans.length = 0;
  });

  it("checkKey and readTail over odd answers: one of the three verdicts, or the tail's shape or a SnapshotError, never another throw, never the key in a reason", async () => {
    const seed = 34302;
    const rng = new Rng(seed);
    const client = createLoopsClient(url, KEY, { readTimeoutMs: 2000 });
    const verdicts = new Map<string, number>();
    let tails = 0;
    for (let i = 0; i < 120; i += 1) {
      // The key check reads twice at most; the tail once or twice. Enough answers are planned for either, the rest discarded.
      plans.length = 0;
      // Half the answers are tail-shaped (events: [], a lastSeq that may or may not be a seq, a cursor that may or may
      // not be a token), so the tail's own reading is reached, not only must()'s refusals.
      const tailish = (): Plan => ({ status: rng.chance(0.7) ? 200 : rng.pick(STATUSES), contentType: "application/json", body: Buffer.from(oddJsonText(rng, { events: rng.pick([[], [], [], [1], null]), lastSeq: rng.pick([0, 5, 2 ** 53 - 1, -1, 1.5, 2 ** 53, Number.POSITIVE_INFINITY, "7", null]), cursor: rng.pick(["s1w1xabcdefghijklmnop", "", "a", oddString(rng, 2), 5, null]) }).replace(/"seq":1,"seq":2,/, ""), "utf8"), mode: "length" });
      plans.push(rng.chance(0.5) ? tailish() : planAnswer(rng), rng.chance(0.5) ? tailish() : planAnswer(rng));
      if (i % 2 === 0) {
        const verdict = await checkKey(client, async () => rng.chance(0.5));
        verdicts.set(verdict.state, (verdicts.get(verdict.state) ?? 0) + 1);
        assert.ok(["ok", "rejected", "unreachable"].includes(verdict.state), replay(seed, i, verdict));
        if (verdict.state !== "ok") assert.ok(!verdict.reason.includes(KEY), `${replay(seed, i, verdict)}: the key in the reason`);
        else assert.equal(typeof verdict.name, "string");
      } else {
        try {
          const tail = await readTail(client);
          tails += 1;
          assert.ok(Number.isSafeInteger(tail.lastSeq) && tail.lastSeq >= 0, `${replay(seed, i, tail)}: lastSeq is no non-negative integer`);
          assert.ok(tail.cursor === null || (typeof tail.cursor === "string" && tail.cursor !== ""), replay(seed, i, tail));
        } catch (error) {
          if (error instanceof assert.AssertionError) throw error;
          // A read that failed on the wire rejects as the client does (the host takes any of these for "down"); a loops
          // answer that is no tail is a SnapshotError with one of its two reasons.
          assert.ok(error instanceof Error, `${replay(seed, i, "tail")}: threw ${String(error)}`);
          if (error instanceof SnapshotError) assert.ok(["loops_down", "unauthorized"].includes(error.reason));
          assert.ok(!error.message.includes(KEY));
        }
      }
    }
    assert.ok((verdicts.get("unreachable") ?? 0) > 0 && (verdicts.get("rejected") ?? 0) > 0, `verdicts: ${JSON.stringify([...verdicts])}`);
    assert.ok(tails > 0, "some tails were read");
    plans.length = 0;
    assertPrototypeClean(seed);
  });
});

describe("fuzz: a passthrough through the host", () => {
  let stub: LoopsStub;
  let host: Host;
  const lines: string[] = [];
  let answer: { status: number; body: unknown } = { status: 200, body: {} };
  before(async () => {
    stub = await createLoopsStub({ ...installation(), routes: { ...installation().routes, "/api/tickets/AT-1": () => answer } });
    host = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", pairing: "off", retryMs: { min: 20, max: 100 }, log: (line) => lines.push(line) });
  });
  after(async () => {
    await host.close();
    await stub.close();
  });

  it("loops' status is forwarded (401 and 403 as 503 unauthorized), the body passes scrubbed, never a 500", async () => {
    const seed = 34310;
    const rng = new Rng(seed);
    for (let i = 0; i < 120; i += 1) {
      const status = rng.pick([200, 200, 201, 400, 401, 403, 404, 409, 410, 418, 429, 500, 503]);
      const body = rng.chance(0.3) ? { ticket: { key: "AT-1", note: stub.key } } : oddValue(rng);
      answer = { status, body };
      const res = await fetch(`${host.url}/world-api/tickets/AT-1?limit=5`);
      const text = await res.text();
      const expected = status === 401 || status === 403 ? 503 : status;
      assert.equal(res.status, expected, replay(seed, i, [status, body]));
      assert.ok(!text.includes(stub.key), `${replay(seed, i, status)}: the key in the body`);
      if (status === 401 || status === 403) assert.deepEqual(JSON.parse(text), { error: "unauthorized" });
    }
    assert.equal(lines.filter((l) => /request failed/.test(l)).length, 0, lines.join("\n"));
    assertPrototypeClean(seed);
  });
});

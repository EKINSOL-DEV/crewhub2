/* `connectHost` and `forgetHostKey`: the two writes the world makes to its own host (spec addendum "a smooth connection").
   A loopback server stands in for the host; the test reads what arrived and what came back. */
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { connectHost, forgetHostKey } from "../src/hostSource.ts";

interface Seen {
  method: string | undefined;
  url: string | undefined;
  contentType: string | undefined;
  accept: string | undefined;
  body: string;
}

async function stub(answer: (seen: Seen) => { status: number; body?: string }) {
  const seen: Seen[] = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString()));
    req.on("end", () => {
      const entry: Seen = { method: req.method, url: req.url, contentType: req.headers["content-type"], accept: req.headers.accept, body };
      seen.push(entry);
      const out = answer(entry);
      res.writeHead(out.status, out.body === undefined ? {} : { "content-type": "application/json" });
      res.end(out.body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { url, seen, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

test("connectHost posts the key as JSON to /world-api/connect and answers the status and body, never the key", async () => {
  const host = await stub(() => ({ status: 204 }));
  try {
    const key = "chl_" + "k".repeat(43);
    const answer = await connectHost(key, host.url, 1000);
    assert.deepEqual(answer, { status: 204, body: null });
    assert.equal(host.seen.length, 1);
    assert.equal(host.seen[0]?.method, "POST");
    assert.equal(host.seen[0]?.url, "/world-api/connect");
    assert.equal(host.seen[0]?.contentType, "application/json");
    assert.deepEqual(JSON.parse(host.seen[0]?.body ?? ""), { key });
    assert.doesNotMatch(JSON.stringify(answer), /chl_/, "the answer never carries the key");
  } finally {
    await host.close();
  }
});

test("connectHost hands back a refusal's JSON body for the world to put into words", async () => {
  const host = await stub(() => ({ status: 403, body: JSON.stringify({ error: "rejected", reason: "a read-only key" }) }));
  try {
    assert.deepEqual(await connectHost("chl_x", host.url, 1000), { status: 403, body: { error: "rejected", reason: "a read-only key" } });
  } finally {
    await host.close();
  }
});

test("a body that is not JSON is null; nothing listening is status 0, and neither throws", async () => {
  const host = await stub(() => ({ status: 405, body: "GET only" }));
  try {
    assert.deepEqual(await connectHost("chl_x", host.url, 1000), { status: 405, body: null });
  } finally {
    await host.close();
  }
  assert.deepEqual(await connectHost("chl_x", "http://127.0.0.1:1", 1000), { status: 0, body: null });
  assert.deepEqual(await forgetHostKey("http://127.0.0.1:1", 1000), { status: 0, body: null });
});

test("forgetHostKey is a DELETE of /world-api/connect without a body", async () => {
  const host = await stub(() => ({ status: 204 }));
  try {
    assert.deepEqual(await forgetHostKey(host.url, 1000), { status: 204, body: null });
    assert.equal(host.seen[0]?.method, "DELETE");
    assert.equal(host.seen[0]?.url, "/world-api/connect");
    assert.equal(host.seen[0]?.body, "");
  } finally {
    await host.close();
  }
});

/**
 * Fuzz (round 34): the stream's parsing of what loops sends (`stream.ts`): the NDJSON lines, the envelope and its
 * `seq`, the heartbeat and the sealed cursor, over a client of the test's own (no network). Seeded; a failing input
 * prints its seed. What a tab sees: events with a non-negative integer `seq`, strictly increasing, each one a line
 * the generator wrote as an envelope; heartbeats with a number and a time; the host's cursor an integer; archived
 * slugs that are slugs; the next connection resumed with the sealed token only when it is a token, else `after=<cursor>`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSegment } from "../src/allowList.ts";
import type { LoopsClient, StreamResume } from "../src/loops.ts";
import { type HostMessage, createUpstream } from "../src/stream.ts";
import { BOUNDARY_NUMBERS, Rng, assertPrototypeClean, oddJsonText, oddString, oddValue, replay } from "./fuzz.ts";
import { waitFor } from "./wait.ts";

const SEEDS = [34201, 34202];
const SEALED = /^[A-Za-z0-9_-]{16,512}$/;
const isSeq = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

/** A token: a real-looking one, or an odd one (too short, too long, odd characters, not a string). */
function oddToken(rng: Rng): unknown {
  const kind = rng.int(0, 7);
  if (kind <= 2) return `s${rng.int(0, 99)}w${rng.int(0, 99)}x${"abcdefghij".repeat(2)}`;
  if (kind === 3) return "A".repeat(rng.pick([0, 1, 15, 16, 512, 513, 5000]));
  if (kind === 4) return `tok?after=0&${oddString(rng, 2, 0)}`;
  if (kind === 5) return oddString(rng, 3);
  if (kind === 6) return rng.pick(BOUNDARY_NUMBERS);
  return rng.pick([null, true, [], {}, undefined]);
}

interface Plan {
  /** The seqs written as valid envelopes, in order. */
  seqs: number[];
  /** Every token a heartbeat of this body offered (a seal survives garbage lines after it, so any of them may travel). */
  tokens: unknown[];
  chunks: Buffer[];
}

/** One connection's body: envelopes with sane and odd seqs, heartbeats with odd cursors, garbage, odd framing. */
function planBody(rng: Rng, from: number): Plan {
  const seqs: number[] = [];
  let next = from;
  const lines: string[] = [];
  const tokens: unknown[] = [];
  for (let k = rng.int(1, 24); k > 0; k -= 1) {
    const kind = rng.int(0, 9);
    if (kind <= 3) {
      next += rng.int(1, 3);
      seqs.push(next);
      const project = rng.chance(0.5) ? { slug: rng.pick(["atlas", "beacon", "a/b", "", " ", "x".repeat(129), oddString(rng, 2, 0)]), key: "AT" } : rng.pick([null, 5, "atlas", [], { slug: 7 }]);
      lines.push(JSON.stringify({ v: 1, seq: next, ts: new Date(1_760_000_000_000 + next).toISOString(), type: rng.pick(["ticket.updated", "project.archived", "project.restored", "dm.created", oddString(rng, 2, 0)]), project, ticket: null, actor: { id: "x", kind: rng.pick(["agent", "user", 5]) }, recipientIds: [], payload: oddValue(rng) }));
    } else if (kind === 4) {
      // An odd seq: a boundary number, a non-finite as JSON text, a duplicate, a lower one, a string, nothing.
      const seqText = rng.pick(["1e999", "-1e999", "-1", "1.5", String(2 ** 53), String(2 ** 53 + 2), `"${next}"`, "null", "true", String(next), String(Math.max(0, next - 2)), "0", "-0", "1E2"]);
      lines.push(`{"v":1,"seq":${seqText},"ts":"2026-10-23T04:00:00.000Z","type":"ticket.updated","project":null,"ticket":null,"actor":{"id":"x","kind":"user"},"recipientIds":[],"payload":{}}`);
      // 1E2 is a valid integer 100 and a seq above every seq this body wrote so far: it counts.
      if (seqText === "1E2" && 100 > next) {
        next = 100;
        seqs.push(100);
      }
    } else if (kind <= 6) {
      const token = oddToken(rng);
      // A heartbeat's seq is loops' word on its position and moves the cursor when it is a seq: here the position as the
      // body stands, or a value that is no seq (ignored); a seq far ahead would be loops' own claim and drop what follows.
      const seq = rng.chance(0.7) ? next : rng.pick([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53, "5", null, Math.max(0, next - 3)]);
      lines.push(oddJsonText(rng, { v: 1, type: "heartbeat", seq, ...(token === undefined ? {} : { cursor: token }), ts: new Date().toISOString() }).replace(/,"seq":1,"seq":2/, ""));
      tokens.push(token);
    } else {
      lines.push(rng.pick([oddJsonText(rng), oddString(rng, 6), "", "   ", "5", "null", "[]", '"x"', "{", "}", `{"type":"heartbeat"}`, `{"seq":${next + 1}}`, `{"type":5,"seq":${next + 1}}`, `{"__proto__":{"polluted":"yes"},"type":"x","seq":${next + 1}}`]));
      if (lines[lines.length - 1]!.startsWith('{"__proto__"')) {
        next += 1;
        seqs.push(next);
      }
    }
  }
  if (rng.chance(0.05)) lines.push(JSON.stringify({ v: 1, seq: next + 1, type: "ticket.updated", project: null, ticket: null, actor: { id: "x", kind: "user" }, recipientIds: [], payload: { text: "p".repeat(100_000) } })) && seqs.push(++next);
  const text = lines.join(rng.chance(0.3) ? "\r\n" : "\n") + "\n";
  // Bytes, cut into chunks at odd places (inside a line, inside a multi-byte character).
  const bytes = Buffer.from(text, "utf8");
  const chunks: Buffer[] = [];
  let at = 0;
  while (at < bytes.length) {
    const size = rng.chance(0.2) ? bytes.length - at : rng.int(1, Math.max(1, Math.min(300, bytes.length - at)));
    chunks.push(bytes.subarray(at, at + size));
    at += size;
  }
  return { seqs, tokens, chunks };
}

function fakeClient(plans: Plan[], tail: () => { lastSeq: number; cursor: unknown }): { client: LoopsClient; resumes: StreamResume[] } {
  const resumes: StreamResume[] = [];
  const client: LoopsClient = {
    transport: "tcp",
    get: () => Promise.reject(new Error("not read here")),
    async getJson<T>(path: string, query: Record<string, string> = {}) {
      if (path === "/api/events" && query["from"] === "tail") {
        const t = tail();
        return { status: 200, body: { events: [], lastSeq: t.lastSeq, ...(t.cursor === undefined ? {} : { cursor: t.cursor }) } as unknown as T };
      }
      return { status: 404, body: null };
    },
    async getPublicJson<T>() {
      return { status: 200, body: { version: "fuzz" } as unknown as T };
    },
    stream(resume, signal) {
      resumes.push(resume);
      const plan = plans.shift();
      if (plan === undefined) return new Promise<Response>((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
      const chunks = [...plan.chunks];
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          const chunk = chunks.shift();
          if (chunk === undefined) controller.close();
          else controller.enqueue(new Uint8Array(chunk));
        },
      });
      return Promise.resolve(new Response(body, { status: 200, headers: { "content-type": "application/x-ndjson" } }));
    },
    scrub: (text) => text,
  };
  return { client, resumes };
}

describe("fuzz: the stream's parsing of loops' lines", () => {
  it("events carry an integer seq, strictly increasing, only from envelope lines; the cursor stays an integer; slugs stay slugs; the resume is the sealed token or after=<cursor>", async () => {
    for (const seed of SEEDS) {
      const rng = new Rng(seed);
      const plans: Plan[] = [];
      let from = 0;
      for (let i = 0; i < 70; i += 1) {
        const plan = planBody(rng, from);
        plans.push(plan);
        from = Math.max(from, ...plan.seqs);
      }
      const all = [...plans];
      const written = new Set(all.flatMap((p) => p.seqs));
      let tailTokens: unknown[] = [];
      let up: ReturnType<typeof createUpstream> | null = null;
      const { client, resumes } = fakeClient(plans, () => {
        const token = rng.chance(0.5) ? oddToken(rng) : undefined;
        tailTokens.push(token);
        return { lastSeq: up === null ? 0 : Math.max(0, up.cursor()), cursor: token };
      });
      const messages: HostMessage[] = [];
      const lines: string[] = [];
      up = createUpstream(client, { reconnectMs: { min: 0, max: 0 }, retryMs: { min: 1, max: 2 }, heartbeatMs: 60_000, log: (l) => lines.push(l), random: () => 0 });
      up.subscribe(null, (m) => messages.push(m));
      await up.start();
      await waitFor("every planned body consumed and the next connection asked for", () => resumes.length === all.length + 1);
      await up.stop();
      // Every event: an integer seq, one the generator wrote as an envelope, strictly increasing.
      let last = -1;
      for (const m of messages) {
        if (m.type === "event") {
          assert.ok(isSeq(m.envelope.seq), `${replay(seed, 0, m.envelope)}: seq is no non-negative integer`);
          assert.ok(m.envelope.seq > last, `seed ${seed}: seq ${m.envelope.seq} after ${last}`);
          assert.ok(written.has(m.envelope.seq), `seed ${seed}: seq ${m.envelope.seq} was never written as an envelope`);
          last = m.envelope.seq;
          assert.equal(Object.getPrototypeOf(m.envelope), Object.prototype, `seed ${seed}: an envelope with another prototype`);
        } else if (m.type === "heartbeat") {
          assert.ok(isSeq(m.seq), `seed ${seed}: heartbeat seq ${String(m.seq)}`);
          assert.equal(typeof m.ts, "string");
        } else assert.ok(["status", "reset"].includes(m.type), `seed ${seed}: a ${m.type} message`);
      }
      assert.ok(isSeq(up.cursor()), `seed ${seed}: the cursor is ${String(up.cursor())}`);
      assert.ok(messages.filter((m) => m.type === "event").length > 100, `seed ${seed}: ${messages.filter((m) => m.type === "event").length} events reached the tab`);
      for (const slug of up.archivedSlugs()) assert.ok(isSegment(slug), `seed ${seed}: archived slug ${JSON.stringify(slug)} is no segment`);
      // The resume of each connection after the first: a sealed token loops offered (a heartbeat's or a tail's) for
      // exactly this position, else after=<cursor>. Either way nothing but a token or a non-negative integer travels.
      for (const [k, resume] of resumes.entries()) {
        if ("cursor" in resume) {
          assert.ok(SEALED.test(resume.cursor), `seed ${seed}: connection ${k} resumed with a token that is no token: ${JSON.stringify(resume.cursor)}`);
          assert.ok(all.some((p) => p.tokens.includes(resume.cursor)) || tailTokens.includes(resume.cursor), `seed ${seed}: connection ${k} resumed with a token nobody offered`);
        } else assert.ok(isSeq(resume.after), `seed ${seed}: connection ${k} resumed after ${String(resume.after)}`);
      }
      assert.ok(resumes.some((r) => "cursor" in r) && resumes.some((r) => "after" in r), `seed ${seed}: both resume shapes seen`);
      assert.equal(lines.filter((l) => /unreadable line skipped/.test(l)).length > 0, true, "garbage lines were skipped and said so");
      assertPrototypeClean(seed);
      tailTokens = [];
    }
  });
});

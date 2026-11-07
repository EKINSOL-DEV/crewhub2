/**
 * The host's fuzz helper (round 34): a seeded PRNG and generators of the inputs that bytes from outside can be, so
 * every fuzz test is deterministic (its seeds are written in the test) and a failing input prints with its seed.
 * No dependency: mulberry32 is eleven lines.
 */
import assert from "node:assert/strict";

/** mulberry32: a 32-bit seeded PRNG, uniform in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  readonly next: () => number;
  readonly seed: number;
  constructor(seed: number) {
    this.seed = seed;
    this.next = mulberry32(seed);
  }
  /** An integer in [min, max]. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)] as T;
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  /** `n` picks of `fn`, joined. */
  times<T>(n: number, fn: (i: number) => T): T[] {
    return Array.from({ length: n }, (_, i) => fn(i));
  }
}

/** Pieces an odd string is built of: the plain, the structural, the unicode-odd, the controls. */
export const PLAIN = ["a", "Z", "0", "9", "-", "_", ".", "CL-85", "tk_1", "atlas", "x".repeat(40), "limit", "cursor", "health"];
export const STRUCTURAL = ["/", "//", "..", "../", "%2F", "%2E%2E", "%", "%zz", "?", "#", "&", "=", ";", ",", " ", "+", "\\", "{slug}", "{ref}", "world-api", "api"];
export const UNICODE_ODD = ["\u0000", "\u0001", "\u001f", "\u007f", "\ud800", "\udfff", "‮", "​", "́", "̈", "１２３", "٣", "é", "ß", "日本", "😀", "﻿", " ", " "];
export const PROTO_KEYS = ["__proto__", "constructor", "prototype", "toString", "hasOwnProperty", "valueOf"];
/** Numbers at and past every limit a host parser has, and the values a JSON number can be or look like. */
export const BOUNDARY_NUMBERS: readonly number[] = [0, -0, 1, -1, 2, 127, 128, 129, 500, 501, 2000, 2001, 4096, 4097, 65535, 65536, 2 ** 31 - 1, 2 ** 31, 2 ** 32, 2 ** 53 - 1, 2 ** 53, 2 ** 53 + 2, 1.5, -1.5, 1e308, -1e308, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.EPSILON, Number.MIN_VALUE];

/** An odd string of up to `maxPieces` pieces, from every pool. `veryLong` makes one piece a long run (past a 128 or 4096 limit). */
export function oddString(rng: Rng, maxPieces = 6, veryLong = 0.05): string {
  const pools = [PLAIN, PLAIN, STRUCTURAL, UNICODE_ODD, PROTO_KEYS];
  let out = rng.times(rng.int(0, maxPieces), () => rng.pick(rng.pick(pools))).join("");
  if (rng.chance(veryLong)) out += rng.pick(["a", "/", "%2F", "́", "0"]).repeat(rng.pick([127, 128, 129, 512, 513, 4096, 4097, 20000]));
  return out;
}

/** A JSON-ish value: wrong types, boundary numbers, odd strings, nested arrays and objects with duplicate and prototype keys. */
export function oddValue(rng: Rng, depth = 0): unknown {
  const kind = rng.int(0, depth > 2 ? 5 : 8);
  switch (kind) {
    case 0:
      return null;
    case 1:
      return rng.chance(0.5);
    case 2:
      return rng.pick(BOUNDARY_NUMBERS);
    case 3:
      return oddString(rng);
    case 4:
      return undefined;
    case 5:
      return rng.pick(["", "0", "-1", "1e999", "NaN", "Infinity", "true", "null", "[]", "{}", "１"]);
    case 6:
      return rng.times(rng.int(0, 4), () => oddValue(rng, depth + 1));
    default: {
      const out: Record<string, unknown> = {};
      for (let i = rng.int(0, 5); i > 0; i -= 1) {
        const key = rng.chance(0.2) ? rng.pick(PROTO_KEYS) : oddString(rng, 2, 0);
        Object.defineProperty(out, key, { value: oddValue(rng, depth + 1), enumerable: true, configurable: true, writable: true });
      }
      return out;
    }
  }
}

/** JSON text of an odd value, with a chance of a raw `__proto__` key, a duplicate key, a 1e999 or a truncation that JSON.parse would still or no longer take. */
export function oddJsonText(rng: Rng, base?: unknown): string {
  let text = JSON.stringify(base === undefined ? oddValue(rng) : base, (_k, v: unknown) => (typeof v === "number" && !Number.isFinite(v) ? "__NONFINITE__" : v)) ?? "null";
  text = text.split('"__NONFINITE__"').join(rng.pick(["1e999", "-1e999", "NaN", "Infinity"]));
  if (text.startsWith("{") && rng.chance(0.3)) text = `{"__proto__":{"polluted":"yes"},"constructor":{"prototype":{"polluted":"yes"}},${text.slice(1)}`.replace(/,}$/, "}");
  if (text.startsWith("{") && rng.chance(0.2)) text = `{"seq":1,"seq":2,${text.slice(1)}`.replace(/,}$/, "}");
  if (rng.chance(0.1)) text = text.slice(0, rng.int(0, text.length));
  return text;
}

const PROTO_BASELINE = Object.getOwnPropertyNames(Object.prototype).sort().join(",");

/** `Object.prototype` is as it was when the test file loaded: no fuzz input polluted it. */
export function assertPrototypeClean(seed: number): void {
  assert.equal(Object.getOwnPropertyNames(Object.prototype).sort().join(","), PROTO_BASELINE, `Object.prototype gained a property (seed ${seed})`);
  assert.equal(({} as { polluted?: unknown }).polluted, undefined, `Object.prototype polluted (seed ${seed})`);
}

/** `encodeURIComponent` that does not throw on a lone surrogate (the surrogate is dropped). */
export const safeEncode = (text: string): string => encodeURIComponent(text.replace(/[\ud800-\udfff]/g, ""));

/** The message a failing input prints: the seed and the input, so it can be replayed. */
export const replay = (seed: number, i: number, input: unknown): string => `seed ${seed} #${i}: ${JSON.stringify(input)?.slice(0, 300)}`;

/** Header-legal text for `http.request` (Node refuses CR, LF and controls in a header value): printable ASCII and Latin-1. */
export function headerText(rng: Rng, maxPieces = 6): string {
  const pieces = [...PLAIN, ...STRUCTURAL, "é", "ß", " ", "ÿ", "\t", "127.0.0.1", "localhost", "http://", "https://", "null", ":", "0", "5180", "80", "[::1]", "@", "evil.example"];
  return rng.times(rng.int(0, maxPieces), () => rng.pick(pieces)).join("");
}

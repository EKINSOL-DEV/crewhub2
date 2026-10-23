/**
 * A seeded fuzz kit for the parsers of outside input (round 34): the town document, the prop document, the chat
 * roads' answers, the host's town body. No dependency: mulberry32 for the numbers, a few generators for the shapes
 * a hostile or broken sender produces (wrong types, prototype keys, odd unicode, boundary numbers, oversize, duplicate
 * keys in JSON text), a mutator that takes a valid value and breaks it in random places, and a guard that
 * `Object.prototype` is as it was. Every test names its seeds; a failing input prints `seed <n>, input <i>` so it can
 * be replayed by running the same generator again. Shared by the packages' fuzz tests through a relative import, so
 * there is one copy.
 */

/** mulberry32: a 32-bit seeded generator, floats in [0, 1). */
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

/** The names a sender uses to reach the prototype, or that a naive reader treats specially. */
export const PROTO_KEYS = ["__proto__", "constructor", "prototype", "toString", "valueOf", "hasOwnProperty", "__defineGetter__", "length"] as const;

/** Strings a parser has to survive: the empty one, control bytes, bidi marks, lone surrogates, full-width digits, long runs, path tricks. */
export const ODD_STRINGS: readonly string[] = [
  "",
  " ",
  "\0",
  "a\0b",
  "\u202Eevil",
  "e\u0301\u0301\u0301",
  "\uD800",
  "\uDC00x",
  "ab\uD83D",
  "１２３",
  "٣٤٥",
  "\uFEFFbom",
  "\u200B",
  "\n",
  "\r\n",
  "\t",
  "../",
  "..",
  "%2F",
  "a/b",
  "a?b=c",
  "#",
  "null",
  "undefined",
  "NaN",
  "true",
  "0",
  "-1",
  "1e999",
  "{\"a\":1}",
  "[]",
  "<script>",
  "'; DROP TABLE towns; --",
  "a".repeat(129),
  "a".repeat(1025),
  "é".repeat(300),
  "🙂".repeat(100),
  "x".repeat(10_000),
  ...PROTO_KEYS,
];

/** Numbers at and past the edges a limit might have, and the ones that are not numbers at all. */
export const ODD_NUMBERS: readonly number[] = [
  0, -0, 1, -1, 2, 3, 4, 0.5, -0.5, 1.5, 7, 8, 9, 31, 32, 33, 50, 51, 63, 64, 65, 127, 128, 129, 140, 141, 200, 201, 255, 256, 257, 360, 361, 2000, 2001,
  Number.EPSILON, 5e-324, 1e-7, 1e21, 1e308, 2 ** 31, 2 ** 31 - 1, -(2 ** 31), 2 ** 32, 2 ** 53, 2 ** 53 - 1, 2 ** 53 + 1, Number.MAX_VALUE, -Number.MAX_VALUE,
  Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY,
];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** An own, enumerable property named `key` on `target`, also for `__proto__` (a plain assignment would set the prototype). */
export function setOwn(target: Obj, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

export class Fuzz {
  readonly next: () => number;
  readonly seed: number;
  constructor(seed: number) {
    this.seed = seed;
    this.next = mulberry32(seed);
  }
  float(): number {
    return this.next();
  }
  /** An integer from `min` to `max`, both included. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  bool(p = 0.5): boolean {
    return this.next() < p;
  }
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)] as T;
  }
  /** A short random string over a wide alphabet, or one of the odd ones. */
  string(max = 24): string {
    if (this.bool(0.4)) return this.pick(ODD_STRINGS);
    const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFXYZ0123456789-_.:/ \u00e9\u4e2d\u0627\uD83D\uDE00\u202E\u0301\uD800";
    const n = this.int(0, max);
    let out = "";
    for (let i = 0; i < n; i += 1) out += alphabet[this.int(0, alphabet.length - 1)];
    return out;
  }
  /** A lowercase slug of `n` letters, as ids and slugs are spelt. */
  slug(min = 1, max = 12): string {
    const n = this.int(min, max);
    let out = "";
    for (let i = 0; i < n; i += 1) out += "abcdefghijklmnopqrstuvwxyz0123456789"[this.int(0, 35)];
    return out;
  }
  number(): number {
    if (this.bool(0.6)) return this.pick(ODD_NUMBERS);
    return this.bool() ? this.int(-300, 300) : (this.next() - 0.5) * 1e4;
  }
  key(): string {
    return this.bool(0.3) ? this.pick(PROTO_KEYS) : this.slug(1, 8);
  }
  /** A JSON-ish value of any type, at most `depth` levels deep; `undefined` and functions appear too (a caller's bug, not JSON). */
  value(depth = 2): unknown {
    const kind = this.int(0, depth > 0 ? 9 : 6);
    switch (kind) {
      case 0:
        return null;
      case 1:
        return undefined;
      case 2:
        return this.bool();
      case 3:
      case 4:
        return this.number();
      case 5:
      case 6:
        return this.string();
      case 7:
        return Array.from({ length: this.int(0, 4) }, () => this.value(depth - 1));
      default: {
        const out: Obj = {};
        const n = this.int(0, 4);
        for (let i = 0; i < n; i += 1) setOwn(out, this.key(), this.value(depth - 1));
        return out;
      }
    }
  }
  /** Every place in a structure where a value sits: its holder and the key, so one can be changed or removed. */
  private places(root: unknown): { holder: Obj | unknown[]; key: string | number }[] {
    const out: { holder: Obj | unknown[]; key: string | number }[] = [];
    const walk = (node: unknown, depth: number) => {
      if (depth > 12) return;
      if (Array.isArray(node)) node.forEach((child, i) => (out.push({ holder: node, key: i }), walk(child, depth + 1)));
      else if (isObj(node)) for (const key of Object.keys(node)) (out.push({ holder: node, key }), walk(node[key], depth + 1));
    };
    walk(root, 0);
    return out;
  }
  /**
   * A broken copy of a valid value: `rounds` random changes, each one of the ways a document goes wrong (a key or
   * element removed, a value of another type, an unknown or prototype key added, an element duplicated or multiplied,
   * a string or number swapped for an odd one, one level of nesting added). The original is never touched.
   */
  mutate<T>(valid: T, rounds = 1): unknown {
    const copy: unknown = structuredClone(valid);
    for (let r = 0; r < rounds; r += 1) {
      const places = this.places(copy);
      if (places.length === 0) return this.value();
      const { holder, key } = this.pick(places);
      const current = Array.isArray(holder) ? holder[key as number] : holder[key as string];
      const op = this.int(0, 9);
      const set = (v: unknown) => (Array.isArray(holder) ? (holder[key as number] = v) : setOwn(holder, key as string, v));
      switch (op) {
        case 0:
          if (Array.isArray(holder)) holder.splice(key as number, 1);
          else delete holder[key as string];
          break;
        case 1:
          set(this.value());
          break;
        case 2:
          if (isObj(holder)) setOwn(holder, this.key(), this.value());
          else holder.push(this.value());
          break;
        case 3:
          if (isObj(holder)) setOwn(holder, this.pick(PROTO_KEYS), this.value(1));
          else if (isObj(current)) setOwn(current, this.pick(PROTO_KEYS), this.value(1));
          else set({ ["__proto__"]: {} });
          break;
        case 4:
          if (Array.isArray(holder)) {
            const times = this.pick([1, 2, 5, 40, 300]);
            for (let i = 0; i < times; i += 1) holder.push(structuredClone(current));
          } else set([current, current]);
          break;
        case 5:
          set(typeof current === "string" ? this.pick(ODD_STRINGS) : this.string());
          break;
        case 6:
          set(typeof current === "number" ? this.pick(ODD_NUMBERS) : this.number());
          break;
        case 7:
          set(this.bool() ? [current] : { nested: current });
          break;
        case 8:
          set(null);
          break;
        default:
          set(typeof current === "boolean" ? !current : this.bool() ? "" : 0);
      }
    }
    return copy;
  }
  /**
   * The JSON text of a value, broken as text: a key written twice, a `__proto__` key, a byte order mark, NUL or
   * garbage inside, the text cut short, or wrapped in whitespace. Sometimes left whole.
   */
  jsonText(value: unknown): string {
    let text = JSON.stringify(value) ?? "null";
    const op = this.int(0, 9);
    const keys = [...text.matchAll(/"([^"\\]{1,40})":/g)].map((m) => m[0]);
    switch (op) {
      case 0:
        return text;
      case 1: {
        if (keys.length === 0) return text;
        const key = this.pick(keys);
        const at = text.indexOf(key);
        return `${text.slice(0, at)}${key}${JSON.stringify(this.value(1)) ?? "null"},${text.slice(at)}`;
      }
      case 2:
        return text.replace("{", `{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},`);
      case 3:
        return `\uFEFF${text}`;
      case 4:
        return text.slice(0, this.int(0, text.length));
      case 5:
        return `${text.slice(0, this.int(0, text.length))}\0${text.slice(this.int(0, text.length))}`;
      case 6:
        return `  \n\t${text}\n\n`;
      case 7:
        return this.pick(["", "null", "[]", "1", "\"x\"", "{", "}", "{}}", "{\"a\":}", "NaN", "undefined", "{\"a\":1,}", "\u202E" + text]);
      case 8:
        return text.replace(/\d+/, (d) => `${d}${"9".repeat(this.int(1, 400))}`);
      default:
        return text.replace(/"/, '"\uD800');
    }
  }
}

/** A picture of `Object.prototype` and `Array.prototype`, to compare after a run. */
export function protoSnapshot(): string {
  const names = (o: object) => Reflect.ownKeys(o).map(String).sort().join(",");
  return `${names(Object.prototype)}|${names(Array.prototype)}|${String(({} as { polluted?: unknown }).polluted)}|${String(([] as unknown as { polluted?: unknown }).polluted)}`;
}

/** The replay note a failing input carries. */
export const replay = (seed: number, index: number, what?: unknown): string =>
  `seed ${seed}, input ${index}${what === undefined ? "" : `: ${safeJson(what)}`}`;

/** JSON for a message; a value JSON cannot say is described instead. */
export function safeJson(value: unknown): string {
  try {
    const text = JSON.stringify(value, (_k, v: unknown) => (typeof v === "number" && !Number.isFinite(v) ? `<${String(v)}>` : v === undefined ? "<undefined>" : v));
    return text === undefined ? "<undefined>" : text.length > 400 ? `${text.slice(0, 400)}… (${text.length} chars)` : text;
  } catch {
    return `<${typeof value}>`;
  }
}

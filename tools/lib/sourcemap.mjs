/* A reader of the source maps `vite build --sourcemap` writes (`dist/assets/*.js.map`, version 3, no sections):
   `originalPositionFor({ line, column })` for a generated 1-based line and 0-based column answers the source file,
   line (1-based), column and name the map holds for the last mapping at or before that column on that line, as the
   `source-map` library's consumer does. No dependency: the mappings are base64 VLQ (five fields: generated column,
   source index, source line, source column, name index, the last four relative to the previous segment's). */

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const DIGITS = new Map([...BASE64].map((c, i) => [c, i]));

/** Decodes the VLQ values of one segment ("AAgBC"), in order. */
function vlq(segment) {
  const values = [];
  let value = 0,
    shift = 0;
  for (const c of segment) {
    const digit = DIGITS.get(c);
    if (digit === undefined) throw new Error(`not a base64 VLQ digit: ${c}`);
    value += (digit & 31) << shift;
    if (digit & 32) shift += 5;
    else {
      values.push(value & 1 ? -(value >> 1) : value >> 1);
      value = 0;
      shift = 0;
    }
  }
  return values;
}

export class SourceMap {
  #sources;
  #names;
  /** Per generated line (0-based): segments [generatedColumn, sourceIndex, sourceLine, sourceColumn, nameIndex] sorted by column. */
  #lines = [];

  /** `map` is the parsed `.map` JSON. */
  constructor(map) {
    if (map.version !== 3 || !Array.isArray(map.sources) || typeof map.mappings !== "string") throw new Error("not a version 3 source map");
    if (map.sections) throw new Error("sectioned source maps are not supported");
    const root = map.sourceRoot ? String(map.sourceRoot).replace(/\/?$/, "/") : "";
    this.#sources = map.sources.map((s) => root + s);
    this.#names = map.names ?? [];
    let source = 0,
      line = 0,
      column = 0,
      name = 0;
    for (const generatedLine of map.mappings.split(";")) {
      const segments = [];
      let generatedColumn = 0;
      if (generatedLine)
        for (const segment of generatedLine.split(",")) {
          if (!segment) continue;
          const v = vlq(segment);
          generatedColumn += v[0];
          if (v.length >= 4) {
            source += v[1];
            line += v[2];
            column += v[3];
            if (v.length >= 5) name += v[4];
            segments.push([generatedColumn, source, line, column, v.length >= 5 ? name : -1]);
          } else segments.push([generatedColumn, -1, 0, 0, -1]);
        }
      this.#lines.push(segments);
    }
  }

  /** The original position of a generated position (line 1-based, column 0-based), or null when the map has none for it. */
  originalPositionFor({ line, column }) {
    const segments = this.#lines[line - 1];
    if (!segments || !segments.length) return null;
    // The last segment at or before the column (binary search).
    let lo = 0,
      hi = segments.length - 1;
    if (segments[0][0] > column) return null;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (segments[mid][0] <= column) lo = mid;
      else hi = mid - 1;
    }
    const [, s, l, c, n] = segments[lo];
    if (s < 0) return null;
    return { source: this.#sources[s] ?? null, line: l + 1, column: c, name: n >= 0 ? (this.#names[n] ?? null) : null };
  }
}

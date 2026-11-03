/** Types for `sourcemap.mjs` (a plain-Node module, so the TypeScript test can import it): the parts a test reaches. */
export interface OriginalPosition {
  source: string | null;
  line: number;
  column: number;
  name: string | null;
}
export class SourceMap {
  /** `map` is the parsed `.map` JSON: version 3, no sections, or it throws. */
  constructor(map: { version: number; sources: string[]; mappings: string; names?: string[]; sourceRoot?: string; file?: string; sections?: unknown });
  /** The original position of a generated position (line 1-based, column 0-based), or null when the map has none for it. */
  originalPositionFor(position: { line: number; column: number }): OriginalPosition | null;
}

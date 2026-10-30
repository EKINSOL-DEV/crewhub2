/** Types for `verdict.mjs` (a plain-Node module, so the TypeScript test can import it). */
export const RULES: { fitMBPerHour: number; jsObjectsMB: number; codeMBPerHour: number; minFitPoints: number; warmupMinute: number };
export function fitWindow(minutes: number): { from: number; to: number } | null;
export function slopePerHour(minutes: number[], ys: number[]): number | null;

export type RowKind = "arrays" | "strings" | "external strings" | "objects" | "closures" | "numbers" | "named constructors" | "code" | "inspector" | "V8 bookkeeping" | "native";
export function rowKind(name: string): RowKind;
export const JS_KINDS: RowKind[];
export const LEFT_OUT_KINDS: RowKind[];

export interface DiffRow {
  name: string;
  kind: RowKind;
  size: number;
  count: number;
}
export interface SnapshotDiff {
  jsBytes: number;
  byKind: Record<RowKind, number>;
  rows: DiffRow[];
}
type Sums = Iterable<readonly [string, { count: number; size: number }]>;
export function snapshotDiff(first: Sums, last: Sums, top?: number): SnapshotDiff;

export interface VerdictSnapshot {
  minute: number;
  /** The snapshot's total, bytes. */
  bytes: number;
  /** Its `(code)` row, bytes. */
  code: number;
}
export interface Verdict {
  rules: typeof RULES;
  minutes: number;
  window: { from: number; to: number } | null;
  points: { minute: number; totalMB: number; codeMB: number; withoutCodeMB: number; inWindow: boolean }[];
  fit: { from: number; to: number; minutes: number[]; mbPerHour: number | null; pass: boolean } | null;
  jsObjects: { from: number; to: number; mb: number; byKindMB: Record<RowKind, number>; rows: DiffRow[]; pass: boolean } | null;
  code: { from: number; to: number; riseMB: number; mbPerHour: number; stretches: { from: number; to: number; mbPerHour: number }[]; pass: boolean } | null;
  levelling: { from: number; mid: number; to: number; firstMBPerHour: number; secondMBPerHour: number; pass: boolean } | null;
  failed: ("fit" | "js-objects" | "code-ceiling" | "levelling")[];
  levelsOff: boolean | null;
  cannot: string[];
  line: string;
}
export function judge(input: { minutes: number; snapshots: VerdictSnapshot[]; diff?: SnapshotDiff | null }): Verdict;
export function formatVerdict(v: Verdict): string[];

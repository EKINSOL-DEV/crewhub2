/** Types for `heap.mjs` (a plain-Node module, so the TypeScript test can import it). */
export interface Shape {
  key: "instancedMeshes" | "materials" | "meshes";
  flag: string;
  what: string;
  unless?: string;
}
export const SHAPES: Shape[];

export interface ShapeCounts {
  instancedMeshes: number;
  materials: number;
  meshes: number;
}
export interface HeapEntry {
  count: number;
  size: number;
}
export interface HeapTotals {
  bytes: number;
  nodes: number;
  byName: Map<string, HeapEntry>;
  shapes: ShapeCounts;
}
/** The JSON `HeapProfiler.takeHeapSnapshot` streams; only the fields the sums read are named. */
export interface HeapSnapshot {
  snapshot: { meta: { node_fields: string[]; node_types: string[][]; edge_fields: string[]; edge_types: string[][] } };
  nodes: number[];
  edges: number[];
  strings: string[];
}
export interface HeapRow extends HeapEntry {
  name: string;
}
export interface GrowthRow extends HeapRow {
  countAfter: number;
  sizeAfter: number;
}

export function heapTotals(cdp: { send(method: string, params?: unknown): Promise<unknown>; on(event: string, handler: (e: { chunk: string }) => void): void; off(event: string, handler: (e: { chunk: string }) => void): void }, options?: { file?: string | null }): Promise<HeapTotals>;
export function summarize(snapshot: HeapSnapshot): HeapTotals;
export function shapeCounts(snapshot: HeapSnapshot): ShapeCounts;
export function formatShapes(shapes: ShapeCounts): string;
export function resolveThreeNames(text: string): { InstancedMesh: string | null; Mesh: string | null; MeshStandardMaterial: string | null };
export function topBySize(totals: HeapTotals, n?: number): HeapRow[];
export function growth(before: HeapTotals, after: HeapTotals, n?: number): GrowthRow[];
export const kb: (bytes: number) => string;
export const mb: (bytes: number) => string;
export function formatRows(rows: HeapRow[] | GrowthRow[], options?: { delta?: boolean }): string[];

/* Heap snapshots over CDP, summed by constructor so two of them can be compared: which kinds of object grew, by count
   and by self size; and counted by shape for the three.js objects a soak watches (round 45): the far crowd's batches
   (`InstancedMesh`), the materials (`MeshStandardMaterial`) and the meshes, found by the flag each constructor sets on
   its instances (`isInstancedMesh`, `isMeshStandardMaterial`, `isMesh`), so no minified name is needed. The snapshot
   itself (hundreds of MB of JSON for a large heap) is parsed and dropped unless a file is asked for; only the totals
   are kept. Tooling only. */
import { writeFileSync } from "node:fs";

/** The shapes counted in every snapshot: the own property that marks an instance, and what a count means. */
export const SHAPES = [
  { key: "instancedMeshes", flag: "isInstancedMesh", what: "InstancedMesh (the far crowd's batches)" },
  { key: "materials", flag: "isMeshStandardMaterial", what: "MeshStandardMaterial" },
  { key: "meshes", flag: "isMesh", what: "Mesh (InstancedMesh left out)", unless: "isInstancedMesh" },
];

/**
 * Takes a heap snapshot (after a GC) and answers its totals: { bytes, nodes, byName: Map<name, { count, size }>,
 * shapes: { instancedMeshes, materials, meshes } }. With `file`, the raw snapshot is written there first (round 41's
 * retainer walks read it); it is a string of the heap's size, so a run whose heap may pass about 290 MB takes its
 * snapshots early: beyond that the chunks no longer fit one string and the snapshot throws.
 */
export async function heapTotals(cdp, { file = null } = {}) {
  await cdp.send("HeapProfiler.enable");
  await cdp.send("HeapProfiler.collectGarbage");
  const chunks = [];
  const onChunk = (e) => chunks.push(e.chunk);
  cdp.on("HeapProfiler.addHeapSnapshotChunk", onChunk);
  await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false, treatGlobalObjectsAsRoots: true, captureNumericValue: false });
  cdp.off("HeapProfiler.addHeapSnapshotChunk", onChunk);
  const text = chunks.join("");
  chunks.length = 0;
  if (file) writeFileSync(file, text);
  return summarize(JSON.parse(text));
}

/** The totals of a parsed snapshot (the JSON `HeapProfiler.takeHeapSnapshot` streams): by constructor name and by shape. */
export function summarize(snapshot) {
  const fields = snapshot.snapshot.meta.node_fields;
  const types = snapshot.snapshot.meta.node_types[0];
  const nodes = snapshot.nodes;
  const strings = snapshot.strings;
  const stride = fields.length;
  const iType = fields.indexOf("type"), iName = fields.indexOf("name"), iSize = fields.indexOf("self_size");
  const byName = new Map();
  let bytes = 0;
  for (let i = 0; i < nodes.length; i += stride) {
    const type = types[nodes[i + iType]];
    const size = nodes[i + iSize];
    bytes += size;
    // Strings, code and the like are summed under their type; objects, closures and arrays under their name.
    let name;
    if (type === "object" || type === "closure" || type === "native") name = `${type === "object" ? "" : type + " "}${strings[nodes[i + iName]]}`;
    else if (type === "array") name = `array ${strings[nodes[i + iName]]}`;
    else if (type === "hidden") name = `(system) ${strings[nodes[i + iName]]}`;
    else name = `(${type})`;
    const entry = byName.get(name) ?? { count: 0, size: 0 };
    entry.count += 1;
    entry.size += size;
    byName.set(name, entry);
  }
  return { bytes, nodes: nodes.length / stride, byName, shapes: shapeCounts(snapshot) };
}

/**
 * Counts the objects of each shape in `SHAPES`: an object node with an own property edge named by the shape's flag
 * (and none named by its `unless`). three.js sets `this.isMesh = true` and the like in every constructor, as an own
 * property, so the count is the instances alive, whatever the build called the class.
 */
export function shapeCounts(snapshot) {
  const meta = snapshot.snapshot.meta;
  const nf = meta.node_fields, ef = meta.edge_fields;
  const nTypes = meta.node_types[0], eTypes = meta.edge_types[0];
  const nodes = snapshot.nodes, edges = snapshot.edges, strings = snapshot.strings;
  const NS = nf.length, ES = ef.length;
  const iType = nf.indexOf("type"), iEdges = nf.indexOf("edge_count");
  const eType = ef.indexOf("type"), eName = ef.indexOf("name_or_index");
  const objectType = nTypes.indexOf("object");
  const propertyType = eTypes.indexOf("property");
  const flags = new Set(SHAPES.flatMap((s) => [s.flag, s.unless].filter(Boolean)));
  const counts = Object.fromEntries(SHAPES.map((s) => [s.key, 0]));
  let e = 0;
  for (let n = 0; n < nodes.length; n += NS) {
    const edgeCount = nodes[n + iEdges];
    if (nodes[n + iType] === objectType) {
      const own = new Set();
      for (let k = e; k < e + edgeCount * ES; k += ES) {
        if (edges[k + eType] !== propertyType) continue;
        const name = strings[edges[k + eName]];
        if (flags.has(name)) own.add(name);
      }
      if (own.size > 0) for (const s of SHAPES) if (own.has(s.flag) && !(s.unless && own.has(s.unless))) counts[s.key] += 1;
    }
    e += edgeCount * ES;
  }
  return counts;
}

/** One line of the shape counts, as the tool prints it under every snapshot. */
export function formatShapes(shapes) {
  return `batches (InstancedMesh) ${shapes.instancedMeshes}, MeshStandardMaterial ${shapes.materials}, Mesh ${shapes.meshes}`;
}

/**
 * The minified names three's classes got in a built chunk (`apps/world/dist/assets/three-*.js`), from their class
 * bodies: `X=class extends Y{constructor(...){super(...),this.isInstancedMesh=!0` and the like. For the retainer walks
 * of round 41, which go by constructor name; the counts above do not need them. Answers { InstancedMesh, Mesh,
 * MeshStandardMaterial }, a name or null each.
 */
export function resolveThreeNames(text) {
  const find = (flag) => {
    const m = new RegExp(`(?:var |[,;])([A-Za-z_$][\\w$]*)=class(?: extends [\\w$]+)?\\{constructor\\([^)]*\\)\\{(?:super\\([^)]*\\),)?this\\.${flag}=!0`).exec(text);
    return m ? m[1] : null;
  };
  return { InstancedMesh: find("isInstancedMesh"), Mesh: find("isMesh"), MeshStandardMaterial: find("isMeshStandardMaterial") };
}

/** The `n` largest entries by self size. */
export function topBySize(totals, n = 25) {
  return [...totals.byName.entries()].sort((a, b) => b[1].size - a[1].size).slice(0, n).map(([name, v]) => ({ name, ...v }));
}

/** From `before` to `after`: the `n` entries that grew most by size (negative growth is a shrink). */
export function growth(before, after, n = 25) {
  const names = new Set([...before.byName.keys(), ...after.byName.keys()]);
  const rows = [];
  for (const name of names) {
    const a = before.byName.get(name) ?? { count: 0, size: 0 };
    const b = after.byName.get(name) ?? { count: 0, size: 0 };
    rows.push({ name, count: b.count - a.count, size: b.size - a.size, countAfter: b.count, sizeAfter: b.size });
  }
  return rows.sort((x, y) => y.size - x.size).slice(0, n);
}

export const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;
export const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

/** Lines for stdout: name, count and size, padded. */
export function formatRows(rows, { delta = false } = {}) {
  const sign = (n) => (delta && n > 0 ? "+" : "") + n;
  return rows.map((r) => `    ${(sign(r.count) + "").padStart(8)}  ${(delta ? (r.size >= 0 ? "+" : "") : "") + kb(r.size).padStart(delta ? 9 : 10)}  ${r.name.slice(0, 70)}`);
}

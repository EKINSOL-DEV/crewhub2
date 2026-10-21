/* Heap snapshots over CDP, summed by constructor so two of them can be compared: which kinds of object grew, by count
   and by self size. The snapshot itself (hundreds of MB of JSON for a large heap) is parsed and dropped; only the
   totals are kept. Tooling only. */

/** Takes a heap snapshot (after a GC) and answers its totals: { bytes, nodes, byName: Map<name, { count, size }> }. */
export async function heapTotals(cdp) {
  await cdp.send("HeapProfiler.enable");
  await cdp.send("HeapProfiler.collectGarbage");
  const chunks = [];
  const onChunk = (e) => chunks.push(e.chunk);
  cdp.on("HeapProfiler.addHeapSnapshotChunk", onChunk);
  await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false, treatGlobalObjectsAsRoots: true, captureNumericValue: false });
  cdp.off("HeapProfiler.addHeapSnapshotChunk", onChunk);
  const snapshot = JSON.parse(chunks.join(""));
  chunks.length = 0;
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
  return { bytes, nodes: nodes.length / stride, byName };
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

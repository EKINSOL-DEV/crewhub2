/* The soak's verdict at a run's end (round 47), by docs/COST_POLICY.md "What to soak and how", item 3, from the tool's
   heap snapshots: does the run level off, and if not, which rule failed. Pure: the snapshots' totals and `(code)` rows
   come in, the verdict goes out; `memory.mjs` prints `formatVerdict` and keeps `verdict` in its JSON, and
   `scripts/test/memoryTool.test.ts` runs the rules on recorded and synthetic numbers. Tooling only.

   The rules, in item 3's words:
   1. The fit: the snapshot total without `(code)` and without the inspector's records (round 62, the one class
      `INSPECTOR_RECORDS`, by its exact name), fitted by least squares over the window (the last 80 minutes of a run of
      two hours or more; minutes 10 to 60 of an hour), rises under 0.2 MB an hour.
   2. The JS objects: the JS-object part of the snapshot diff from the first snapshot to the last is at most 0.5 MB.
   3. The ceiling: `(code)` grows at most 1.5 MB an hour.
   4. The levelling test, for a run of more than an hour: the `(code)` rate over the second half is at most the rate
      over the first half.
   5. The record size (round 62): the class the fit leaves out stays at most 1 KB a record, in every snapshot read and in
      what each stretch between two added per new record, so a page leak cannot hide under that name.
   The diff, the ceiling and the levelling test read from the first snapshot at or after minute 10 (the warm-up) to the
   last, as round 46 read them (10 to 180, the halves split at the snapshot nearest the middle, 90); for an hour that is
   the fit's window itself. */

export const RULES = {
  /** The fit's ceiling, MB an hour. */
  fitMBPerHour: 0.2,
  /** The JS objects' ceiling from the first snapshot to the last, MB. */
  jsObjectsMB: 0.5,
  /** The `(code)` ceiling, MB an hour. */
  codeMBPerHour: 1.5,
  /** The fewest snapshots inside the window a fit takes (round 46: 120, 150 and 180 in minutes 100 to 180). */
  minFitPoints: 3,
  /** Before this minute the run warms up: no snapshot of it is read. */
  warmupMinute: 10,
  /** The inspector's record's ceiling, bytes (round 62's soak read 288 in all seven snapshots). */
  inspectorRecordBytes: 1024,
};

/** The one class the fit leaves out (round 62), by its exact name: a record per network request while a CDP session is attached. */
export const INSPECTOR_RECORDS = "native blink::NetworkResourcesData::ResourceData";

const MB = 1048576;

/** The fit's window for a run of `minutes`: the last 80 minutes of two hours or more, 10 to 60 of an hour; else null. */
export function fitWindow(minutes) {
  if (minutes >= 120) return { from: minutes - 80, to: minutes };
  if (minutes >= 60) return { from: 10, to: 60 };
  return null;
}

/** The least-squares slope of `ys` over `minutes`, in units an hour; null under two distinct minutes. */
export function slopePerHour(minutes, ys) {
  const n = minutes.length;
  if (n < 2) return null;
  const xs = minutes.map((m) => m / 60);
  const mx = xs.reduce((a, b) => a + b, 0) / n,
    my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0,
    den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den > 0 ? num / den : null;
}

/**
 * The kind of a row of the snapshot sums (`heap.mjs` `summarize`'s names), as item 3 lists them. The JS objects are
 * arrays, strings, external string data, objects, closures, numbers and named constructors; left out are `(code)`, the
 * inspector's `NetworkResourcesData`, V8's bookkeeping (`native system /` but its external string data, and the
 * `(system)`, `(object shape)` and other parenthesised internals) and the browser's own `native` objects.
 */
export function rowKind(name) {
  if (name === "(code)") return "code";
  if (/NetworkResourcesData|InspectorNetwork|protocol::/.test(name)) return "inspector";
  if (name === "native system / ExternalStringData") return "external strings";
  if (name.startsWith("native system /") || name.startsWith("(system)")) return "V8 bookkeeping";
  if (name.startsWith("native ")) return "native";
  if (name.startsWith("array ")) return "arrays";
  if (name.startsWith("closure ")) return "closures";
  if (name === "(string)" || name === "(concatenated string)" || name === "(sliced string)") return "strings";
  if (name === "(number)" || name === "(heap number)" || name === "(bigint)") return "numbers";
  if (name === "Object") return "objects";
  if (name.startsWith("(")) return "V8 bookkeeping";
  return "named constructors";
}

/** The JS-object kinds, in item 3's order; the kinds left out follow. */
export const JS_KINDS = ["arrays", "strings", "external strings", "objects", "closures", "numbers", "named constructors"];
export const LEFT_OUT_KINDS = ["code", "inspector", "V8 bookkeeping", "native"];

/**
 * The snapshot diff from `first` to `last` (each an iterable of [name, { count, size }], a `byName` map or its entries),
 * by kind: { jsBytes, byKind: { kind: bytes }, rows: the JS rows that moved most, by size, at most `top` }. A name in
 * one snapshot only counts from or to nothing.
 */
export function snapshotDiff(first, last, top = 8) {
  const a = new Map(first),
    b = new Map(last);
  const byKind = Object.fromEntries([...JS_KINDS, ...LEFT_OUT_KINDS].map((k) => [k, 0]));
  const rows = [];
  for (const name of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(name) ?? { count: 0, size: 0 },
      y = b.get(name) ?? { count: 0, size: 0 };
    const size = y.size - x.size;
    if (size === 0 && y.count === x.count) continue;
    const kind = rowKind(name);
    byKind[kind] += size;
    if (JS_KINDS.includes(kind)) rows.push({ name, kind, size, count: y.count - x.count });
  }
  rows.sort((p, q) => Math.abs(q.size) - Math.abs(p.size));
  const jsBytes = JS_KINDS.reduce((s, k) => s + byKind[k], 0);
  return { jsBytes, byKind, rows: rows.slice(0, top) };
}

/**
 * Round 63: the snapshot minutes that do not fall on the same moment of the fake's loop as minute 0. The loop is the
 * scenario's story played at the run's speed (`loopMinutes`: 16 for small-team at speed 1, 4 at speed 4). A snapshot
 * at another moment reads another state of the town (round 62's chat soak, 30 minutes apart: 479 to 689 meshes; round
 * 63 at multiples of 16: 560 four times), so the counts and the fit compare like with like only at multiples. Empty
 * when every minute is a multiple, and when there is no loop to keep to (speed 0, or no length known).
 */
export function offLoopMinutes(snapshotMinutes, loopMinutes) {
  if (!(loopMinutes > 0)) return [];
  return snapshotMinutes.filter((m) => {
    const turns = m / loopMinutes;
    return Math.abs(turns - Math.round(turns)) > 1e-9;
  });
}

/** The tool's warning for `offLoopMinutes` (`loop`: `{ minutes, scenario, speed }`), or null when there is none. */
export function loopWarning(snapshotMinutes, loop) {
  const off = offLoopMinutes(snapshotMinutes, loop?.minutes);
  if (off.length === 0) return null;
  const one = off.length === 1;
  return `warning: --snapshots ${off.join(", ")} ${one ? "is not a multiple" : "are not multiples"} of the fake's loop (${loop.minutes} minutes: ${loop.scenario} at speed ${loop.speed}), so ${one ? "it reads" : "they read"} another moment of it than minute 0; the counts and the fit compare like with like only at multiples (docs/COST_POLICY.md, "What to soak and how", item 3)`;
}

/**
 * The verdict. `minutes` is the run's length; `snapshots` are { minute, bytes, code, rows } (the snapshot's total and its
 * `(code)` row, bytes, and its sums by name as `snapshotDiff` takes them; numbers kept without `rows` leave nothing out
 * and run no record-size rule); `diff` is `snapshotDiff` from the first snapshot read to the last (null when the tool could not
 * make it). Answers what it read and judged, `failed` (the rules that failed), `levelsOff` (true, false, or null when
 * the run cannot be judged, with `cannot` saying why) and `line`, the one verdict line.
 */
export function judge({ minutes, snapshots, diff = null }) {
  const window = fitWindow(minutes);
  const read = snapshots.filter((s) => s.minute >= RULES.warmupMinute && s.minute <= minutes).sort((p, q) => p.minute - q.minute);
  const recordsAt = (s) => new Map(s.rows ?? []).get(INSPECTOR_RECORDS) ?? { count: 0, size: 0 };
  const points = snapshots.map((s) => {
    const records = recordsAt(s);
    return { minute: s.minute, totalMB: s.bytes / MB, codeMB: s.code / MB, withoutCodeMB: (s.bytes - s.code) / MB, recordsCount: records.count, recordsMB: records.size / MB, fittedMB: (s.bytes - s.code - records.size) / MB, inWindow: window !== null && s.minute >= window.from && s.minute <= window.to };
  });
  const cannot = [];
  const failed = [];

  // 1. The fit over the window.
  let fit = null;
  if (window === null) cannot.push(`the run is ${minutes} minutes; the rules need an hour (minutes 10 to 60) or two hours or more (the last 80 minutes)`);
  else {
    const inside = points.filter((p) => p.inWindow);
    if (inside.length < RULES.minFitPoints) cannot.push(`${inside.length} snapshot${inside.length === 1 ? "" : "s"} in the window (minutes ${window.from} to ${window.to}), a fit takes ${RULES.minFitPoints}`);
    else {
      const mbPerHour = slopePerHour(inside.map((p) => p.minute), inside.map((p) => p.fittedMB));
      fit = { from: window.from, to: window.to, minutes: inside.map((p) => p.minute), mbPerHour, pass: mbPerHour < RULES.fitMBPerHour };
      if (!fit.pass) failed.push("fit");
    }
  }

  // 2. The JS objects from the first snapshot read to the last.
  let jsObjects = null;
  if (read.length >= 2 && diff) {
    jsObjects = { from: read[0].minute, to: read[read.length - 1].minute, mb: diff.jsBytes / MB, byKindMB: Object.fromEntries(Object.entries(diff.byKind).map(([k, v]) => [k, v / MB])), rows: diff.rows, pass: diff.jsBytes / MB <= RULES.jsObjectsMB };
    if (!jsObjects.pass) failed.push("js-objects");
  } else if (window !== null) cannot.push(read.length < 2 ? "fewer than two snapshots from minute 10 on: no diff" : "no snapshot diff");

  // 3. The (code) ceiling, and 4. the levelling test, over the same span.
  let code = null;
  let levelling = null;
  if (read.length >= 2 && window !== null) {
    const rate = (a, b) => (b.code - a.code) / MB / ((b.minute - a.minute) / 60);
    const first = read[0],
      last = read[read.length - 1];
    code = { from: first.minute, to: last.minute, riseMB: (last.code - first.code) / MB, mbPerHour: rate(first, last), stretches: read.slice(1).map((s, i) => ({ from: read[i].minute, to: s.minute, mbPerHour: rate(read[i], s) })), pass: rate(first, last) <= RULES.codeMBPerHour };
    if (!code.pass) failed.push("code-ceiling");
    if (minutes > 60) {
      const middle = (first.minute + last.minute) / 2;
      const inner = read.slice(1, -1);
      if (inner.length === 0) cannot.push("the levelling test needs a snapshot between the first and the last");
      else {
        const mid = inner.reduce((best, s) => (Math.abs(s.minute - middle) < Math.abs(best.minute - middle) ? s : best));
        const firstHalf = rate(first, mid),
          secondHalf = rate(mid, last);
        levelling = { from: first.minute, mid: mid.minute, to: last.minute, firstMBPerHour: firstHalf, secondMBPerHour: secondHalf, pass: secondHalf <= firstHalf };
        if (!levelling.pass) failed.push("levelling");
      }
    }
  }

  // 5. The record size, and the class's growth, which the fit no longer shows.
  let inspector = null;
  if (read.length > 0 && read.some((s) => s.rows)) {
    const first = recordsAt(read[0]),
      last = recordsAt(read[read.length - 1]);
    const perRecord = (r) => (r.count > 0 ? r.size / r.count : null);
    // What a stretch added, per new record: an average over all the records would dilute a leak that starts late.
    const added = read.slice(1).map((s, i) => {
      const a = recordsAt(read[i]),
        b = recordsAt(s);
      return (b.size - a.size) / Math.max(b.count - a.count, 1);
    });
    const worstBytesPerRecord = Math.max(0, ...read.map((s) => perRecord(recordsAt(s)) ?? 0), ...added);
    const inside = points.filter((p) => p.inWindow);
    inspector = { name: INSPECTOR_RECORDS, from: read[0].minute, to: read[read.length - 1].minute, firstCount: first.count, lastCount: last.count, mbPerHour: fit ? slopePerHour(inside.map((p) => p.minute), inside.map((p) => p.recordsMB)) : null, bytesPerRecord: perRecord(last), worstBytesPerRecord, pass: worstBytesPerRecord <= RULES.inspectorRecordBytes };
    if (!inspector.pass) failed.push("inspector-records");
  }

  const levelsOff = failed.length > 0 ? false : cannot.length > 0 ? null : true;
  const said = { fit: "the fit", "js-objects": "the JS objects", "code-ceiling": "the (code) ceiling", levelling: "the levelling test", "inspector-records": "the inspector's record size" };
  const passed = ["the fit", "the JS objects", "the (code) ceiling", ...(levelling ? ["the levelling test"] : []), ...(inspector ? ["the inspector's record size"] : [])];
  const line =
    levelsOff === true
      ? `verdict: levels off (item 3: ${passed.slice(0, -1).join(", ")} and ${passed.at(-1)} pass)`
      : levelsOff === false
        ? `verdict: does not level off: ${failed.map((f) => said[f]).join(", ")} failed${cannot.length > 0 ? `; not judged: ${cannot.join("; ")}` : ""}`
        : `verdict: cannot judge: ${cannot.join("; ")}`;
  return { rules: RULES, minutes, window, points, fit, jsObjects, code, levelling, inspector, failed, levelsOff, cannot, line };
}

const f2 = (x) => (x === null ? "-" : x.toFixed(2));
const f3 = (x) => (x === null ? "-" : x.toFixed(3));

/** The verdict as the tool prints it at the run's end: the rules' numbers, then the one verdict line. */
export function formatVerdict(v) {
  const out = [`the verdict (COST_POLICY "What to soak and how", item 3), a run of ${v.minutes} minutes${v.window ? `, the fit's window minutes ${v.window.from} to ${v.window.to}` : ", too short for a window"}:`];
  for (const p of v.points) out.push(`  minute ${String(p.minute).padStart(3)}: total ${f2(p.totalMB)} MB, (code) ${f2(p.codeMB)} MB, without code ${f2(p.withoutCodeMB)} MB${v.inspector ? `, less the inspector's records ${f2(p.fittedMB)} MB` : ""}${p.inWindow ? "  (in the window)" : ""}`);
  if (v.fit) out.push(`  the fit, total without code${v.inspector ? " and without the inspector's records" : ""} over minutes ${v.fit.minutes.join(", ")}: ${f3(v.fit.mbPerHour)} MB an hour (under ${v.rules.fitMBPerHour}: ${v.fit.pass ? "pass" : "FAIL"})`);
  if (v.inspector) {
    const r = v.inspector;
    out.push(
      r.bytesPerRecord === null && r.worstBytesPerRecord === 0
        ? `  the inspector's records (${r.name}), left out of the fit: none in the snapshots`
        : `  the inspector's records (${r.name}), left out of the fit: minute ${r.from} to ${r.to}, ${r.firstCount} to ${r.lastCount} records; ${r.mbPerHour === null ? "no fit" : `${f3(r.mbPerHour)} MB an hour over minutes ${v.fit.minutes.join(", ")}`}; ${r.bytesPerRecord === null ? "-" : Math.round(r.bytesPerRecord)} bytes a record, ${Math.round(r.worstBytesPerRecord)} at worst (at most ${v.rules.inspectorRecordBytes}: ${r.pass ? "pass" : "FAIL"})`,
    );
  }
  if (v.jsObjects) {
    const j = v.jsObjects;
    out.push(`  the JS objects, minute ${j.from} to ${j.to}: ${f2(j.mb)} MB (at most ${v.rules.jsObjectsMB}: ${j.pass ? "pass" : "FAIL"}); ${JS_KINDS.map((k) => `${k} ${f2(j.byKindMB[k])}`).join(", ")}; left out: ${LEFT_OUT_KINDS.map((k) => `${k} ${f2(j.byKindMB[k])}`).join(", ")} MB`);
    for (const r of j.rows) out.push(`    ${r.name.slice(0, 60).padEnd(60)} ${(r.size / 1024).toFixed(0).padStart(7)} kB  count ${r.count >= 0 ? "+" : ""}${r.count}  [${r.kind}]`);
  }
  if (v.code) {
    const c = v.code;
    out.push(`  (code), minute ${c.from} to ${c.to}: ${c.riseMB >= 0 ? "+" : ""}${f2(c.riseMB)} MB, ${f2(c.mbPerHour)} MB an hour (at most ${v.rules.codeMBPerHour}: ${c.pass ? "pass" : "FAIL"}); by stretch ${c.stretches.map((s) => `${s.from}->${s.to} ${f2(s.mbPerHour)}`).join(", ")} MB an hour`);
  }
  if (v.levelling) {
    const l = v.levelling;
    out.push(`  the levelling test: (code) ${l.mid}->${l.to} ${f2(l.secondMBPerHour)} MB an hour, ${l.from}->${l.mid} ${f2(l.firstMBPerHour)} (the second half at most the first: ${l.pass ? "pass" : "FAIL"})`);
  } else if (v.minutes > 60 && v.code) out.push("  the levelling test: not run (no snapshot between the first and the last)");
  else if (v.window && v.minutes <= 60) out.push("  the levelling test: not asked for a run of an hour");
  out.push(v.line);
  return out;
}

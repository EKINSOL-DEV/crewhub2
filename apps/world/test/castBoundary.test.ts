import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const REGISTRATION = "apps/world/src/world/cast.ts";
/** This test names cast packages in its own examples. */
const SELF = "apps/world/test/castBoundary.test.ts";
/** What a cast may import besides its own files: the cast contract and the types it is written in. */
const ALLOWED = ["@crewhub/world-cast", "@crewhub/world-engine", "@crewhub/world-style", "three"];

/** The cast package a repo-relative path lies in ("packages/cast-sprouts/"), or null. */
function castDir(file: string): string | null {
  return /^packages\/cast-[^/]+\//.exec(file)?.[0] ?? null;
}

/** Module specifiers a source file imports or re-exports (static and dynamic). */
function specifiers(source: string): string[] {
  const found: string[] = [];
  const pattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) found.push(match[1]!);
  return found;
}

/** Why a file breaks the cast boundary, or null. `file` is repo-relative with forward slashes. */
export function castBoundaryViolation(file: string, source: string): string | null {
  const own = castDir(file);
  for (const spec of specifiers(source)) {
    if (spec.startsWith("@crewhub/cast-")) {
      if (own) return `${file} imports ${spec}; a cast never imports another (extend it through the manifest)`;
      if (file !== REGISTRATION) return `${file} imports ${spec}; only ${REGISTRATION} registers casts`;
    } else if (spec.startsWith(".")) {
      const target = castDir(path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)));
      if (target && target !== own) return `${file} reaches into a cast package through ${spec}`;
      if (own && !target) return `${file} reaches out of its cast package through ${spec}`;
    } else if (own && !ALLOWED.some((name) => spec === name || spec.startsWith(`${name}/`)) && !spec.startsWith("node:")) {
      return `${file} imports ${spec}; a cast draws through the kit (${ALLOWED.join(", ")})`;
    }
  }
  return null;
}

function* sources(dir: string): Generator<string> {
  for (const entry of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) yield* sources(rel);
    else if (/\.tsx?$/.test(entry.name)) yield rel;
  }
}

test("the scanner flags cast imports outside the registration module, and casts that reach out", () => {
  const sprouts = "packages/cast-sprouts/src/index.ts";
  assert.equal(castBoundaryViolation(REGISTRATION, 'import { cast } from "@crewhub/cast-sprouts";'), null);
  assert.match(castBoundaryViolation("apps/world/src/world/TownScene.ts", 'import { cast } from "@crewhub/cast-sprouts";') ?? "", /only/);
  assert.match(castBoundaryViolation("apps/world/src/App.tsx", 'const m = import("@crewhub/cast-sprouts/figure.json");') ?? "", /only/);
  assert.match(castBoundaryViolation("apps/world/src/world/a.ts", 'import f from "../../../../packages/cast-sprouts/figure.json";') ?? "", /reaches into/);
  assert.match(castBoundaryViolation(sprouts, 'import { cast } from "@crewhub/cast-classic-bots";') ?? "", /never imports another/);
  assert.match(castBoundaryViolation(sprouts, 'import f from "../../cast-classic-bots/figure.json";') ?? "", /reaches into/);
  assert.match(castBoundaryViolation(sprouts, 'import { TownScene } from "../../../apps/world/src/world/TownScene";') ?? "", /reaches out/);
  assert.match(castBoundaryViolation(sprouts, 'import { reduce } from "@crewhub/world-model";') ?? "", /draws through the kit/);
  assert.match(castBoundaryViolation(sprouts, 'import { demoSource } from "@crewhub/demo";') ?? "", /draws through the kit/);
  assert.equal(castBoundaryViolation(sprouts, 'import type { CastFactory } from "@crewhub/world-cast";\nimport figure from "../figure.json" with { type: "json" };\nimport * as THREE from "three";'), null);
});

test("no module outside a cast package imports it, except the registration; no cast imports another", () => {
  const violations: string[] = [];
  for (const dir of ["apps", "packages"])
    for (const file of sources(dir)) {
      if (file === SELF) continue;
      const problem = castBoundaryViolation(file, readFileSync(path.join(ROOT, file), "utf8"));
      if (problem) violations.push(problem);
    }
  assert.deepEqual(violations, []);
});

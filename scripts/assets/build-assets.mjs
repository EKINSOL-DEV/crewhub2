#!/usr/bin/env node
// Optimizes manifest-listed kit models into public/assets/models/ (committed).
// gltf-transform optimize: prune + dedup + quantize + meshopt compression —
// tiny files, decoded natively by drei's useGLTF.
import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SRC = path.join(ROOT, "assets-src");
const OUT = path.join(ROOT, "public/assets/models");
// Kenney zips name the glTF-binary folder inconsistently across kits.
const MODEL_DIRS = ["Models/GLTF format", "Models/GLB format"];

const manifest = JSON.parse(await readFile(path.join(ROOT, "src/game/assets/manifest.json"), "utf8"));
mkdirSync(OUT, { recursive: true });

let failed = false;
for (const [id, { kit, file }] of Object.entries(manifest.models)) {
  const src = MODEL_DIRS.map((d) => path.join(SRC, kit, d, file)).find(existsSync);
  if (!src) {
    console.error(`✗ ${id}: ${file} not found in ${kit} — run \`pnpm assets:fetch\` first`);
    failed = true;
    continue;
  }
  const out = path.join(OUT, `${id}.glb`);
  execSync(`pnpm exec gltf-transform optimize "${src}" "${out}" --compress meshopt`, { stdio: "pipe" });
  console.log(`✓ ${id}.glb`);
}
if (failed) process.exit(1);

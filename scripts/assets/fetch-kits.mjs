#!/usr/bin/env node
// Downloads the CC0 Kenney kits the game is built from into assets-src/
// (gitignored). kenney.nl pages embed a direct zip link; the hash segment
// changes per release, so we scrape it fresh each run. Idempotent: a kit
// directory that already exists is skipped.
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";

const KITS = [
  { slug: "nature-kit", page: "https://kenney.nl/assets/nature-kit" },
  { slug: "fantasy-town-kit", page: "https://kenney.nl/assets/fantasy-town-kit" },
];

const ROOT = path.resolve(import.meta.dirname, "../..");
const DEST = path.join(ROOT, "assets-src");
mkdirSync(DEST, { recursive: true });

for (const kit of KITS) {
  const dir = path.join(DEST, kit.slug);
  if (existsSync(dir)) {
    console.log(`✓ ${kit.slug} already present — skipping`);
    continue;
  }
  console.log(`↓ ${kit.slug}: scraping ${kit.page}`);
  const html = await (await fetch(kit.page)).text();
  const m = html.match(/https:\/\/kenney\.nl\/media\/pages\/assets\/[^"]+\.zip/);
  if (!m) {
    console.error(`✗ ${kit.slug}: no zip link found on ${kit.page} — download manually into ${dir}`);
    process.exitCode = 1;
    continue;
  }
  console.log(`↓ ${kit.slug}: ${m[0]}`);
  const zip = Buffer.from(await (await fetch(m[0])).arrayBuffer());
  const zipPath = path.join(DEST, `${kit.slug}.zip`);
  writeFileSync(zipPath, zip);
  execSync(`unzip -o -q "${zipPath}" -d "${dir}"`, { stdio: "inherit" });
  rmSync(zipPath);
  console.log(`✓ ${kit.slug} ready`);
}

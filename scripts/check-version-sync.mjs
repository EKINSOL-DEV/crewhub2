#!/usr/bin/env node
// Version-sync guard (M6 Lane J, EKI-98 — D-M6-6).
//
// Asserts that `src-tauri/tauri.conf.json` and `package.json` carry the same
// version, and — when a tag is passed as the first argument — that the tag is
// exactly `v<version>`. Run by ci.yml on every PR/push and by release.yml's
// `plan` job (with the tag) before anything builds.
//
// Usage:
//   node scripts/check-version-sync.mjs            # files only
//   node scripts/check-version-sync.mjs v0.1.0     # files + tag

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (rel) => JSON.parse(readFileSync(path.join(root, rel), "utf8"));

const fail = (msg) => {
  console.error(`version-sync FAILED: ${msg}`);
  console.error("Versions are bumped together in src-tauri/tauri.conf.json and package.json");
  console.error("(docs/RELEASING.md). Tags must be v<version> of those files.");
  process.exit(1);
};

const pkgVersion = readJson("package.json").version;
const tauriVersion = readJson("src-tauri/tauri.conf.json").version;

if (!pkgVersion) fail("package.json has no version field");
if (!tauriVersion) fail("src-tauri/tauri.conf.json has no version field");
if (pkgVersion !== tauriVersion) {
  fail(`package.json is ${pkgVersion} but src-tauri/tauri.conf.json is ${tauriVersion}`);
}

const tag = process.argv[2];
if (tag) {
  if (tag !== `v${pkgVersion}`) {
    fail(`tag is ${tag} but the synced file version is ${pkgVersion} (expected tag v${pkgVersion})`);
  }
  console.log(`version-sync OK: ${pkgVersion} (tag ${tag})`);
} else {
  console.log(`version-sync OK: ${pkgVersion}`);
}

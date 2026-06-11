#!/usr/bin/env node
// Release-notes extractor (M6 Lane J, EKI-98 — D-M6-6/D-M6-7).
//
// Prints the CHANGELOG.md section for one version to stdout. release.yml uses
// the output as the GitHub release body, which is also what the in-app
// "What's new" dialog renders after an update (EKI-100) — so this file is the
// single source of release notes.
//
// Usage:
//   node scripts/extract-release-notes.mjs 0.1.0
//   node scripts/extract-release-notes.mjs 0.1.0 --allow-unreleased
//
// Sections are `## [x.y.z]` headings (Keep a Changelog), optionally with a
// ` - YYYY-MM-DD` suffix. A missing section is a hard failure — tagging
// without writing the changelog is a runbook violation (docs/RELEASING.md) —
// unless `--allow-unreleased` is passed (workflow_dispatch rehearsals), in
// which case the `## [Unreleased]` section is used as a stand-in.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const allowUnreleased = args.includes("--allow-unreleased");
const version = args.find((a) => !a.startsWith("--"));

if (!version) {
  console.error("usage: extract-release-notes.mjs <version> [--allow-unreleased]");
  process.exit(1);
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const changelog = readFileSync(path.join(root, "CHANGELOG.md"), "utf8");

/** Return the body of the `## [name]` section, or null when absent. */
function section(name) {
  const lines = changelog.split("\n");
  const headingRe = new RegExp(`^## \\[${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\](\\s+-\\s+.*)?\\s*$`);
  const start = lines.findIndex((l) => headingRe.test(l));
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines
    .slice(start + 1, end)
    .join("\n")
    .trim();
}

let notes = section(version);
if (notes === null && allowUnreleased) {
  const unreleased = section("Unreleased");
  if (unreleased !== null) {
    notes = `> Rehearsal build — notes taken from the [Unreleased] section.\n\n${unreleased}`;
  }
}

if (notes === null) {
  console.error(
    `extract-release-notes FAILED: no \`## [${version}]\` section in CHANGELOG.md.\n` +
      `Rename \`## [Unreleased]\` to \`## [${version}] - YYYY-MM-DD\` before tagging ` +
      `(docs/RELEASING.md runbook step 2).`,
  );
  process.exit(1);
}

if (notes === "") {
  console.error(`extract-release-notes FAILED: the \`## [${version}]\` section is empty.`);
  process.exit(1);
}

process.stdout.write(`${notes}\n`);

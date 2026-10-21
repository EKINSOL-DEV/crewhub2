#!/usr/bin/env node
/**
 * The Node preflight for `npm run check` and `npm test` (and the host): the repository runs on the Node major that
 * `.nvmrc` names (24; `engines` says the same). An older Node runs the TypeScript tests without a syntax error and
 * fails them in slow, quiet ways (one host test timed out on Node 22 tonight), so the scripts stop here first, with
 * one sentence. No dependency, nothing else.
 *
 *   node scripts/check-node.mjs            exits 0 on the right major, 1 with the sentence otherwise
 *
 * `checkNode(found, required)` is the rule, for the test; the main part reads `.nvmrc` and `process.versions.node`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The major of a version string such as "24.21.0" or "v22.22.0", or null when it is not one. */
export function majorOf(version) {
  const match = /^v?(\d+)(?:\.\d+)*/.exec(String(version).trim());
  return match === null ? null : Number(match[1]);
}

/** The sentence when `found` is not on the `required` major, else null. */
export function checkNode(found, required) {
  const have = majorOf(found);
  const want = majorOf(required);
  if (want === null) return `.nvmrc does not name a Node major (${String(required).trim()})`;
  if (have === want) return null;
  return `Node ${want} required (.nvmrc), found v${String(found).replace(/^v/, "")}: run nvm use`;
}

/**
 * The host's softer word (round 12, hostnodewarn): one warning line when the running major is not `.nvmrc`'s, never a
 * stop (the host works on another Node today; the chat session's stream was the one thing seen to differ on Node 22).
 * Null on the right major, and null when `.nvmrc` names no major (nothing to compare with).
 */
export function nodeWarning(found, required) {
  const have = majorOf(found);
  const want = majorOf(required);
  if (want === null || have === want) return null;
  return `Node ${want} is what CrewHub World is tested on (.nvmrc); this is v${String(found).replace(/^v/, "")}: run nvm use if anything misbehaves.`;
}

const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const nvmrc = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".nvmrc");
  let required = "";
  try {
    required = readFileSync(nvmrc, "utf8");
  } catch {
    required = "";
  }
  const problem = checkNode(process.versions.node, required);
  if (problem !== null) {
    console.error(problem);
    process.exit(1);
  }
}

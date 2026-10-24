/**
 * The Node the host runs on, against `.nvmrc` (round 12, hostnodewarn): the shell default on a Mac may be another
 * major, and `npm run world` runs on whatever `node` is first on the PATH. The host does not stop for that (it works
 * today); it says one line at its start, and the doctor lists it as a warning. The rule and the words are the
 * repository's `scripts/check-node.mjs` (one source for the preflight and the host), the file read the same way.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nodeWarning } from "../../../scripts/check-node.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** `.nvmrc`'s text, or "" when it cannot be read (then there is nothing to compare with and no warning). */
export function readNvmrc(repoRoot = REPO_ROOT): string {
  try {
    return readFileSync(path.join(repoRoot, ".nvmrc"), "utf8");
  } catch {
    return "";
  }
}

/**
 * The running Node's version. `CREWHUB_WORLD_NODE_VERSION` stands in for it in the tests only (the host cannot be
 * started on another Node from a test); it is read nowhere else.
 */
export function runningNodeVersion(env: Record<string, string | undefined> = process.env): string {
  const faked = env["CREWHUB_WORLD_NODE_VERSION"];
  return faked !== undefined && faked !== "" ? faked : process.versions.node;
}

/** The one warning line for the host's start, or null on `.nvmrc`'s major. */
export function nodeWarningLine(found: string = runningNodeVersion(), required: string = readNvmrc()): string | null {
  return nodeWarning(found, required);
}

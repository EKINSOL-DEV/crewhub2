/**
 * The no-model-call guard. CrewHub World makes no model call and no network call tonight (spec: "No model call of any
 * kind"; AGENTS.md: "Normal rendering, motion, state changes, and attention signals require zero model calls"). This
 * scans every source file under apps/, packages/, skills/ and scripts/ (never node_modules or dist) for:
 *   - imports of AI SDKs,
 *   - model endpoints,
 *   - any `fetch(`, `XMLHttpRequest`, `WebSocket(`, `EventSource(` or `sendBeacon(` outside NETWORK_ALLOWLIST,
 * and checks every package.json for an AI SDK dependency. It runs in `npm test` through
 * packages/world-model/test/noModelCalls.test.ts, and directly: `node scripts/scan-model-calls.ts`.
 *
 * This file and its test define the forbidden patterns, so they match themselves; SELF is the only exemption.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Files allowed to use the network, with the reason. Empty: the demo has no network at all. */
export const NETWORK_ALLOWLIST: Readonly<Record<string, string>> = {};

/** The scanner and its test hold the patterns and their fixtures, so they would flag themselves. */
export const SELF: readonly string[] = ["scripts/scan-model-calls.ts", "packages/world-model/test/noModelCalls.test.ts"];

export const SCAN_ROOTS = ["apps", "packages", "skills", "scripts"] as const;
const SOURCE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|html|py|sh)$/;
const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);

/** Package names of AI SDKs, matched at the start of an import specifier or a dependency name. */
const AI_PACKAGE = /^(@anthropic-ai\/|anthropic|openai|@google\/genai|@google\/generative-ai|cohere|@?mistral|ollama|@?langchain)/;
const IMPORT_SPECIFIER = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*["']([^"']+)["']/g;
const ENDPOINTS = [
  /api\.anthropic\.com/,
  /api\.openai\.com/,
  /generativelanguage\.googleapis\.com/,
  /\/v1\/messages/,
  /\/v1\/chat\/completions/,
];
const NETWORK: { rule: string; pattern: RegExp }[] = [
  { rule: "fetch(", pattern: /(?<![\w$])fetch\s*\(/ },
  { rule: "XMLHttpRequest", pattern: /(?<![\w$])XMLHttpRequest\b/ },
  { rule: "WebSocket(", pattern: /(?<![\w$])WebSocket\s*\(/ },
  { rule: "EventSource(", pattern: /(?<![\w$])EventSource\s*\(/ },
  { rule: "sendBeacon(", pattern: /(?<![\w$])sendBeacon\s*\(/ },
];

export interface Finding {
  file: string;
  line: number;
  rule: "ai-sdk-import" | "model-endpoint" | "network" | "ai-sdk-dependency";
  detail: string;
}

/** Scans one file's text. `file` is a repo-relative path with forward slashes. */
export function scanSource(file: string, text: string, allowlist: Readonly<Record<string, string>> = NETWORK_ALLOWLIST): Finding[] {
  const findings: Finding[] = [];
  const lines = text.split("\n");
  lines.forEach((content, index) => {
    const line = index + 1;
    for (const match of content.matchAll(IMPORT_SPECIFIER)) {
      if (AI_PACKAGE.test(match[1]!)) findings.push({ file, line, rule: "ai-sdk-import", detail: `imports ${match[1]}` });
    }
    for (const endpoint of ENDPOINTS) {
      if (endpoint.test(content)) findings.push({ file, line, rule: "model-endpoint", detail: `mentions ${endpoint.source.replace(/\\/g, "")}` });
    }
    if (!(file in allowlist)) {
      for (const { rule, pattern } of NETWORK) {
        if (pattern.test(content)) findings.push({ file, line, rule: "network", detail: `uses ${rule} and ${file} is not on the network allowlist` });
      }
    }
  });
  return findings;
}

/** Scans a package.json text for an AI SDK among its dependencies. */
export function scanPackageJson(file: string, text: string): Finding[] {
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return [{ file, line: 1, rule: "ai-sdk-dependency", detail: "package.json is not valid JSON" }];
  }
  const findings: Finding[] = [];
  for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    const group = manifest[field];
    if (typeof group !== "object" || group === null) continue;
    for (const name of Object.keys(group)) {
      if (AI_PACKAGE.test(name)) findings.push({ file, line: 1, rule: "ai-sdk-dependency", detail: `${field} lists ${name}` });
    }
  }
  return findings;
}

async function* walk(directory: string): AsyncGenerator<string> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(path.join(directory, entry.name));
    } else yield path.join(directory, entry.name);
  }
}

/** Scans the tree under `root`; also returns how many files it read, so a test can tell an empty scan from a clean one. */
export async function scanTree(root: string, allowlist: Readonly<Record<string, string>> = NETWORK_ALLOWLIST): Promise<{ findings: Finding[]; scanned: number }> {
  const findings: Finding[] = [];
  let scanned = 0;
  const rootManifest = path.join(root, "package.json");
  findings.push(...scanPackageJson("package.json", await readFile(rootManifest, "utf8")));
  for (const top of SCAN_ROOTS) {
    for await (const absolute of walk(path.join(root, top))) {
      const file = path.relative(root, absolute).split(path.sep).join("/");
      if (SELF.includes(file)) continue;
      const base = path.basename(file);
      if (base === "package.json") {
        scanned += 1;
        findings.push(...scanPackageJson(file, await readFile(absolute, "utf8")));
      } else if (SOURCE.test(base)) {
        scanned += 1;
        findings.push(...scanSource(file, await readFile(absolute, "utf8"), allowlist));
      }
    }
  }
  return { findings, scanned };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const { findings, scanned } = await scanTree(root);
  for (const f of findings) console.error(`${f.file}:${f.line} ${f.rule}: ${f.detail}`);
  console.log(findings.length === 0 ? `No model or network calls in ${scanned} files.` : `${findings.length} forbidden use(s) found.`);
  process.exit(findings.length === 0 ? 0 : 1);
}

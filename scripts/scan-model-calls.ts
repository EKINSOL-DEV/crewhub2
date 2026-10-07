/**
 * The no-model-call guard. CrewHub World makes no model call and no network call tonight (spec: "No model call of any
 * kind"; AGENTS.md: "Normal rendering, motion, state changes, and attention signals require zero model calls"). This
 * scans every source file under apps/, packages/, skills/, scripts/ and tools/ (never node_modules or dist) for:
 *   - imports of AI SDKs,
 *   - model endpoints,
 *   - any `fetch(`, `XMLHttpRequest`, `WebSocket(`, `EventSource(` or `sendBeacon(` outside NETWORK_ALLOWLIST,
 * and checks every package.json for an AI SDK dependency.
 *
 * Tooling: `tools/` holds the helper scripts that look at and measure the running world in a headless browser
 * (`playwright-core`, a root dev dependency). They are scanned by the same rules, and by two more that keep the
 * browser where it belongs:
 *   - under tools/ every address must be this machine's (`127.0.0.1` or `localhost`): a tool opens the local dev
 *     server and nothing else;
 *   - outside tools/ nothing may import a browser driver, and no workspace's package.json may depend on one. The
 *     world's apps and packages never see it.
 *
 * Loops readiness: the world reads crewhub-loops through a relay of its own (`apps/host`), tested against a fake
 * crewhub-loops (`packages/loops-fake`). Both may use the network (NETWORK_ROOTS) and, like tools/, spell out only this
 * machine's addresses: the host's loops URL is configuration, never a literal elsewhere. In the browser, one file may
 * fetch: the live source, which only reads its own host's `/world-api` (NETWORK_ALLOWLIST). A test that starts a server
 * on 127.0.0.1 and talks to it is loopback to itself, not a network call.
 *
 * It runs in `npm test` through
 * packages/world-model/test/noModelCalls.test.ts, and directly: `node scripts/scan-model-calls.ts`.
 *
 * This file and its test define the forbidden patterns, so they match themselves; SELF is the only exemption.
 */
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Files allowed to use the network, with the reason. The demo has no network at all. */
export const NETWORK_ALLOWLIST: Readonly<Record<string, string>> = {
  "packages/loops-client/src/hostSource.ts": "the live source: reads its own host's /world-api (same origin by default), nothing else",
};

/** Folders allowed to use the network, with the reason. Their addresses must be this machine's, as under tools/. */
export const NETWORK_ROOTS: Readonly<Record<string, string>> = {
  "apps/host/": "the relay: holds the loops key and reads crewhub-loops on the configured URL (127.0.0.1:8091 by default)",
  "packages/loops-fake/": "the fake crewhub-loops: a server on 127.0.0.1 for tests and for running before the install",
};

/** The scanner and its test hold the patterns and their fixtures, so they would flag themselves. */
export const SELF: readonly string[] = ["scripts/scan-model-calls.ts", "packages/world-model/test/noModelCalls.test.ts"];

export const SCAN_ROOTS = ["apps", "packages", "skills", "scripts", "tools"] as const;
/** Tooling only: scripts that drive a browser against the local dev server. Their output folder is not source. */
export const TOOLING_ROOT = "tools/";
const TOOLING_OUTPUT = "tools/out/";
const SOURCE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|html|py|sh)$/;
const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);

/** Package names of AI SDKs, matched at the start of an import specifier or a dependency name. */
const AI_PACKAGE = /^(@anthropic-ai\/|anthropic|openai|@google\/genai|@google\/generative-ai|cohere|@?mistral|ollama|@?langchain)/;
const IMPORT_SPECIFIER = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*["']([^"']+)["']/g;
/** Browser drivers: tooling, never part of the world. */
const BROWSER_PACKAGE = /^(@playwright\/|(playwright|puppeteer)(-core)?(\/|$))/;
/** An address with a scheme and a host, and the hosts a tool may open. */
const ADDRESS = /\b(?:https?|wss?):\/\/([^\s/"'`:$)]+|\$\{)/g;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
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
  rule: "ai-sdk-import" | "model-endpoint" | "network" | "ai-sdk-dependency" | "browser-import" | "browser-dependency" | "tooling-address";
  detail: string;
}

/** Scans one file's text. `file` is a repo-relative path with forward slashes. */
export function scanSource(file: string, text: string, allowlist: Readonly<Record<string, string>> = NETWORK_ALLOWLIST): Finding[] {
  const findings: Finding[] = [];
  const lines = text.split("\n");
  const tooling = file.startsWith(TOOLING_ROOT);
  const networkRoot = Object.keys(NETWORK_ROOTS).some((root) => file.startsWith(root));
  lines.forEach((content, index) => {
    const line = index + 1;
    for (const match of content.matchAll(IMPORT_SPECIFIER)) {
      if (AI_PACKAGE.test(match[1]!)) findings.push({ file, line, rule: "ai-sdk-import", detail: `imports ${match[1]}` });
      if (!tooling && BROWSER_PACKAGE.test(match[1]!)) findings.push({ file, line, rule: "browser-import", detail: `imports ${match[1]}: a browser driver belongs under ${TOOLING_ROOT} only` });
    }
    if (tooling || networkRoot) {
      for (const match of content.matchAll(ADDRESS)) {
        // An address built from a variable cannot be checked: a tool spells its host out.
        const host = match[1] === "${" ? "a computed host" : match[1]!;
        if (!LOCAL_HOSTS.has(host)) findings.push({ file, line, rule: "tooling-address", detail: `addresses ${host}: ${tooling ? "a tool" : "the host and the fake"} only open 127.0.0.1 or localhost` });
      }
    }
    for (const endpoint of ENDPOINTS) {
      if (endpoint.test(content)) findings.push({ file, line, rule: "model-endpoint", detail: `mentions ${endpoint.source.replace(/\\/g, "")}` });
    }
    if (!(file in allowlist) && !networkRoot) {
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
      // The root manifest may hold a browser driver as a dev dependency, for tools/; a workspace's never does.
      if (BROWSER_PACKAGE.test(name) && (file !== "package.json" || field !== "devDependencies")) {
        findings.push({ file, line: 1, rule: "browser-dependency", detail: `${field} lists ${name}: a browser driver is a root dev dependency for ${TOOLING_ROOT} only` });
      }
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
    if (!existsSync(path.join(root, top))) continue;
    for await (const absolute of walk(path.join(root, top))) {
      const file = path.relative(root, absolute).split(path.sep).join("/");
      if (SELF.includes(file) || file.startsWith(TOOLING_OUTPUT)) continue;
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

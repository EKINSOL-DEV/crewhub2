/**
 * The no-model-call guard: the scanner is tested on strings (it must catch each forbidden shape and leave the
 * allowed ones alone), then run on the real tree. See scripts/scan-model-calls.ts.
 */
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { scanPackageJson, scanSource, scanTree } from "../../../scripts/scan-model-calls.ts";

const rules = (text: string, allow: Record<string, string> = {}) => scanSource("apps/world/src/x.ts", text, allow).map((f) => f.rule);

test("AI SDK imports are found in every import form", () => {
  for (const spec of ["@anthropic-ai/sdk", "anthropic", "openai", "@google/genai", "@google/generative-ai", "cohere-ai", "@mistralai/mistralai", "ollama", "langchain", "@langchain/core"]) {
    assert.deepEqual(rules(`import Client from "${spec}";`), ["ai-sdk-import"], `import from ${spec}`);
  }
  assert.deepEqual(rules(`const sdk = require('openai');`), ["ai-sdk-import"]);
  assert.deepEqual(rules(`const sdk = await import("@anthropic-ai/sdk");`), ["ai-sdk-import"]);
  assert.deepEqual(rules(`export * from "ollama";`), ["ai-sdk-import"]);
  assert.deepEqual(rules(`import "openai/shims/web";`), ["ai-sdk-import"]);
});

test("ordinary imports are left alone", () => {
  assert.deepEqual(rules(`import { useState } from "react";\nimport { where } from "@crewhub/world-model";`), []);
});

test("model endpoints are found in any string", () => {
  for (const url of ["https://api.anthropic.com/v1/messages", "https://api.openai.com/v1/foo", "https://generativelanguage.googleapis.com/v1/x", "/v1/chat/completions", "/v1/messages"]) {
    assert.ok(rules(`const url = "${url}";`).includes("model-endpoint"), url);
  }
});

test("network primitives are found unless the file is allowlisted", () => {
  for (const code of ["await fetch(url)", "globalThis.fetch (url)", "new XMLHttpRequest()", "new WebSocket(url)", "new EventSource(url)", "navigator.sendBeacon(url)"]) {
    assert.deepEqual(rules(code), ["network"], code);
    assert.deepEqual(rules(code, { "apps/world/src/x.ts": "a test allowlist entry" }), [], `${code} (allowlisted)`);
  }
});

test("words that merely contain the names are not network calls", () => {
  assert.deepEqual(rules("this.refetch(`board`); prefetch(); const fetchedAt = 1; // the WebSocketless demo"), []);
});

test("a finding names the file and the line", () => {
  const [finding] = scanSource("packages/x/src/a.ts", "const a = 1;\nconst b = fetch('/x');\n");
  assert.deepEqual([finding?.file, finding?.line], ["packages/x/src/a.ts", 2]);
});

test("package.json dependencies are checked in every group", () => {
  assert.equal(scanPackageJson("package.json", JSON.stringify({ dependencies: { react: "1" } })).length, 0);
  assert.equal(scanPackageJson("package.json", JSON.stringify({ devDependencies: { "@anthropic-ai/sdk": "1" } })).length, 1);
  assert.equal(scanPackageJson("package.json", JSON.stringify({ peerDependencies: { openai: "1" } })).length, 1);
  assert.equal(scanPackageJson("package.json", "{nope").length, 1);
});

test("a browser driver is tooling: imported under tools/ only, a dev dependency of the root only", () => {
  for (const spec of ["playwright-core", "playwright", "@playwright/test", "playwright-core/lib/server", "puppeteer", "puppeteer-core"]) {
    for (const file of ["apps/world/src/x.ts", "apps/world/test/x.test.ts", "packages/world-model/src/x.ts", "packages/cast-sprouts/src/index.ts", "scripts/x.ts", "skills/x/run.mjs"]) {
      assert.deepEqual(scanSource(file, `import { chromium } from "${spec}";`).map((f) => f.rule), ["browser-import"], `${spec} in ${file}`);
      assert.deepEqual(scanSource(file, `const { chromium } = await import('${spec}');`).map((f) => f.rule), ["browser-import"], `${spec} in ${file}, dynamic`);
    }
    assert.deepEqual(scanSource("tools/lib/world.mjs", `import { chromium } from "${spec}";`), [], `${spec} under tools/`);
  }
  assert.deepEqual(scanSource("apps/world/src/x.ts", `import { playwrightish } from "./playwright-notes.ts";`), [], "a file that merely has the name");
  const manifest = (field: string) => JSON.stringify({ [field]: { "playwright-core": "1.62.1" } });
  assert.deepEqual(scanPackageJson("package.json", manifest("devDependencies")), []);
  assert.deepEqual(scanPackageJson("package.json", manifest("dependencies")).map((f) => f.rule), ["browser-dependency"]);
  for (const file of ["apps/world/package.json", "packages/world-model/package.json"]) {
    assert.deepEqual(scanPackageJson(file, manifest("devDependencies")).map((f) => f.rule), ["browser-dependency"], file);
  }
});

test("a tool only addresses this machine, and keeps every other rule", () => {
  const tool = (text: string) => scanSource("tools/x.mjs", text).map((f) => f.rule);
  assert.deepEqual(tool("const base = `http://127.0.0.1:${port}/`; const other = 'http://localhost:5176/cast-preview';"), []);
  for (const text of ['await page.goto("https://example.com/");', "const u = `http://${host}:${port}/`;", 'const s = "ws://10.0.0.2:9222";', "open('http://127.0.0.1.example.com/')"]) {
    assert.deepEqual(tool(text), ["tooling-address"], text);
  }
  assert.deepEqual(tool("await fetch(`http://127.0.0.1:${port}/`);"), ["network"], "no network primitive of its own");
  assert.deepEqual(tool('import OpenAI from "openai";'), ["ai-sdk-import"]);
  // Outside tools/ an address is not this rule's business (documentation links, the loops shapes).
  assert.deepEqual(scanSource("packages/demo/src/x.ts", 'const docs = "https://example.com/";'), []);
});

test("the real tree: playwright-core is imported under tools/ and nowhere under apps/ or packages/", async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const importers: string[] = [];
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "out") continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(entry.name) && /["']playwright-core["'/]/.test(await readFile(absolute, "utf8"))) importers.push(path.relative(root, absolute).split(path.sep).join("/"));
    }
  };
  for (const top of ["apps", "packages", "tools"]) await walk(path.join(root, top));
  // This test names the package itself; the scanner's own fixtures are its only other mention outside tools/.
  const outside = importers.filter((file) => !file.startsWith("tools/") && file !== "packages/world-model/test/noModelCalls.test.ts");
  assert.deepEqual(outside, []);
  assert.ok(importers.some((file) => file.startsWith("tools/")), "the tools do use it (the walk found the import)");
  for (const workspace of ["apps/world/package.json", ...(await readdir(path.join(root, "packages"))).map((name) => `packages/${name}/package.json`)]) {
    assert.doesNotMatch(await readFile(path.join(root, workspace), "utf8"), /playwright|puppeteer/, workspace);
  }
});

test("the real tree has no AI SDK, no model endpoint and no network call", async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const { findings, scanned } = await scanTree(root);
  assert.ok(scanned > 50, `the scan read ${scanned} files`);
  assert.deepEqual(findings.map((f) => `${f.file}:${f.line} ${f.detail}`), []);
});

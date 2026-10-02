/**
 * The no-model-call guard: the scanner is tested on strings (it must catch each forbidden shape and leave the
 * allowed ones alone), then run on the real tree. See scripts/scan-model-calls.ts.
 */
import assert from "node:assert/strict";
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

test("the real tree has no AI SDK, no model endpoint and no network call", async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const { findings, scanned } = await scanTree(root);
  assert.ok(scanned > 50, `the scan read ${scanned} files`);
  assert.deepEqual(findings.map((f) => `${f.file}:${f.line} ${f.detail}`), []);
});

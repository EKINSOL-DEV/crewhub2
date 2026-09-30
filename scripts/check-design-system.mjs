import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fail = [];

/* ---- a. Hex guard: colours live in tokens.css; everything else uses the token variables. ---- */
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/;
const HEX_ALLOWED = new Set([
  // The palette itself.
  "apps/world/src/styles/tokens.css",
  // Robot and material colours of the Three.js scene, not UI palette (the scene is out of scope of the design system).
  "apps/world/src/world/models.ts",
  "apps/world/src/world/shaders.ts",
  "apps/world/src/world/data.ts",
]);

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(css|ts|tsx)$/.test(entry.name)) yield full;
  }
}

const files = [path.join(root, "apps/world/index.html")];
for await (const file of walk(path.join(root, "apps/world/src"))) files.push(file);
let scanned = 0;
for (const file of files) {
  const rel = path.relative(root, file).split(path.sep).join("/");
  if (HEX_ALLOWED.has(rel)) continue;
  scanned += 1;
  (await readFile(file, "utf8")).split("\n").forEach((line, i) => {
    const match = line.match(HEX_RE);
    if (match) fail.push(`hex guard: ${rel}:${i + 1}: ${match[0]} (use a token variable from styles/tokens.css)`);
  });
}
if (!fail.length) console.log(`design: hex guard ok (${scanned} files)`);

/* ---- b. Dark-token parity: the media-query dark block and the explicit data-theme="dark" block must match. ---- */
const tokensFile = "apps/world/src/styles/tokens.css";
const css = (await readFile(path.join(root, tokensFile), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");

/* Body of the first block whose header matches `header`, found by counting braces so nested blocks are handled. */
function blockBody(source, header) {
  const start = source.search(header);
  if (start < 0) return null;
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}" && --depth === 0) return source.slice(open + 1, i);
  }
  return null;
}
function declarations(body) {
  const map = new Map();
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) map.set(m[1], m[2].replace(/\s+/g, " ").trim());
  return map;
}

const media = blockBody(css, /@media\s*\(\s*prefers-color-scheme:\s*dark\s*\)/);
const mediaRoot = media && blockBody(media, /:root/);
const explicit = blockBody(css, /:root\[data-theme="dark"\]/);
const parityBefore = fail.length;
if (mediaRoot === null || explicit === null) {
  fail.push(`dark parity: could not find the ${mediaRoot === null ? "@media dark" : ':root[data-theme="dark"]'} block in ${tokensFile}`);
} else {
  const a = declarations(mediaRoot);
  const b = declarations(explicit);
  for (const name of [...new Set([...a.keys(), ...b.keys()])].sort()) {
    if (!a.has(name)) fail.push(`dark parity: ${name} only in :root[data-theme="dark"] (${b.get(name)})`);
    else if (!b.has(name)) fail.push(`dark parity: ${name} only in @media dark (${a.get(name)})`);
    else if (a.get(name) !== b.get(name)) fail.push(`dark parity: ${name} differs: @media dark "${a.get(name)}" vs data-theme dark "${b.get(name)}"`);
  }
  if (fail.length === parityBefore) console.log(`design: dark token parity ok (${a.size} vars)`);
}

if (fail.length) {
  console.error(fail.join("\n"));
  process.exit(1);
}

import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const ignored = new Set([".git", "node_modules", "dist", "target"]);

async function markdownFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name) || entry.isSymbolicLink()) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(fullPath));
    else if (entry.name.endsWith(".md")) files.push(fullPath);
  }
  return files;
}

let errors = 0;
const documents = await markdownFiles(root);
for (const file of documents) {
  const contents = await readFile(file, "utf8");
  for (const match of contents.matchAll(/\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1];
    if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(target)) continue;
    const localPath = decodeURIComponent(target.split(/[?#]/)[0]);
    if (!localPath) continue;
    try {
      await access(path.resolve(path.dirname(file), localPath));
    } catch {
      console.error(`${path.relative(root, file)}: missing link target ${target}`);
      errors++;
    }
  }
}
if (errors) process.exitCode = 1;
else console.log(`Local file links checked in ${documents.length} Markdown documents.`);

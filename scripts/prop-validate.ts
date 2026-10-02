/**
 * Validate crewhub-prop/1 files with exactly the validator the world uses at import.
 *   npm run prop:validate -- <file.json> [more.json]
 * Exit 0: every file is valid (warnings may be printed). Exit 1: at least one file is invalid. Exit 2: usage error.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { validatePropModel } from "../packages/world-engine/src/props.ts";

const USAGE = "usage: npm run prop:validate -- <file.json> [more.json]";
const args = process.argv.slice(2);
if (args.includes("-h") || args.includes("--help")) {
  console.log(USAGE);
  process.exit(0);
}
const options = args.filter((a) => a.startsWith("-") && a !== "-");
if (options.length || !args.length) {
  console.error(options.length ? `unknown option: ${options.join(" ")}` : "no prop file given");
  console.error(USAGE);
  process.exit(2);
}

// npm runs scripts from the repository root; resolve paths against the directory the command was typed in.
const base = process.env.INIT_CWD ?? process.cwd();
let invalid = 0;
for (const file of args) {
  let text: string;
  try {
    text = await readFile(path.resolve(base, file), "utf8");
  } catch (e) {
    console.error(`${file}: cannot read file (${(e as NodeJS.ErrnoException).code ?? "error"})`);
    console.error(USAGE);
    process.exit(2);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    console.error(`${file}: not valid JSON: ${(e as Error).message}`);
    invalid++;
    continue;
  }
  const result = validatePropModel(json);
  for (const w of result.warnings) console.warn(`${file}: warning: ${w.path}: ${w.message}`);
  if (result.ok) {
    const { name, parts, footprint } = result.value;
    console.log(`${file}: ok (${name}, ${parts.length} parts, footprint ${footprint.width}x${footprint.depth})`);
  } else {
    invalid++;
    for (const e of result.errors) console.error(`${file}: ${e.path}: ${e.message}`);
  }
}
if (invalid) {
  console.error(`${invalid} of ${args.length} prop file(s) invalid`);
  process.exit(1);
}

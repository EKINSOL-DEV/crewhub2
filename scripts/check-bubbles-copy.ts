/**
 * npm run check:copy: the verbatim loops copies (scripts/bubbles-copy.ts) still equal their source. The crewhub-loops
 * checkout is `CREWHUB_LOOPS_DIR`, else the sibling directory `../crewhub-loops`; without one the check is skipped.
 * Exit 1 when a copy differs from its source.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkCopies } from "./bubbles-copy.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const loopsDir = path.resolve(process.env["CREWHUB_LOOPS_DIR"] ?? path.join(root, "..", "crewhub-loops"));
const result = checkCopies(root, loopsDir);
for (const message of result.messages) (result.status === "failed" ? console.error : console.log)(message);
if (result.status === "failed") process.exit(1);

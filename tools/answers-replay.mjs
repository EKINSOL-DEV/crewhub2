#!/usr/bin/env node
/* answers-replay.mjs: the merge plan for Nicky's answers, replayed (round 37; docs/proposals/merge-plan.md).

   Usage:
     node tools/answers-replay.mjs <base> <tab|cookie+expiry|cookie> [q3] [q8] [q11] [q14] [q15] [--check]

   In the current git worktree, whose tree must be clean: a detached checkout of <base>, then the yes-branches among
   q3, q8, q11, q14 and q15 merged in that order, then question 1's branch last (`tab` is task/r27-tab-pairing,
   `cookie+expiry` is task/q1-cookie-expiry, `cookie` merges neither). A conflict the plan knows (its hand merges A to G,
   kept as data below, each a rule on the two sides' content) is resolved and committed; any other conflict stops the
   run with the file named and the merge left open for a person. After `tab`, the two LOOPS_SETUP.md paragraphs that
   branch once dropped must be there (C: the branch carries them since round 38; missing means it dropped them again,
   and the run stops); after `cookie+expiry`, q3's health-keys test gets the field q1 adds (B, folded into the merge
   commit). Prints every step and the result's sha last; with --check runs
   `npm run check` on the result (its log under tools/out/). Touches no branch, never pushes: the result is a detached
   commit to look at, or to fast-forward feat/world-demo to by hand once the answers are in and the night's regress is
   green.

   The pure parts (the rules, the restore, the keys fix) are exported for scripts/test/answersReplay.test.ts. No git
   there: this file's main runs only when it is the program. */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const BRANCHES = {
  q3: "task/q3-health-less",
  q8: "task/q8-offline-say",
  q11: "task/q11-recent-since",
  q14: "task/q14-dm-read-cap",
  q15: "task/q15-body-cap",
  tab: "task/r27-tab-pairing",
  "cookie+expiry": "task/q1-cookie-expiry",
};
/** The order the yes-branches merge in; question 1's branch always comes after them. */
export const ORDER = ["q3", "q8", "q11", "q14", "q15"];

/** What the plan does not know: the message names the file, and a person looks. */
export class Refusal extends Error {}
const refuse = (why) => {
  throw new Refusal(`${why}: a person must look`);
};

/** The conflict blocks of a file with markers: { start, end, a, b } with the two sides as line lists. */
export function conflictBlocks(text) {
  const lines = text.split("\n");
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("<<<<<<< ")) continue;
    let j = i + 1;
    while (j < lines.length && !lines[j].startsWith("=======")) {
      // A diff3 or zdiff3 block (merge.conflictStyle in git's config) carries the base between the sides: never a side.
      if (lines[j].startsWith("||||||| ")) refuse("a conflict block with a base section (merge.conflictStyle diff3 or zdiff3)");
      j++;
    }
    let k = j + 1;
    while (k < lines.length && !lines[k].startsWith(">>>>>>> ")) k++;
    if (j >= lines.length || k >= lines.length) refuse("conflict markers without an end");
    blocks.push({ start: i, end: k, a: lines.slice(i + 1, j), b: lines.slice(j + 1, k) });
    i = k;
  }
  return { lines, blocks };
}

// --- The hand merges, as rules on the two sides' content (which side git calls "ours" does not matter). ---

/** E. apps/world/hostPort.ts, r27 x q3: r27's `const head` (no /pair proxy), q3's key(name, state) with its comment. */
function hostPort(a, b) {
  const [r27, q3] = a.some((l) => l.includes("goes to the host")) ? [a, b] : [b, a];
  const head = r27.filter((l) => l.includes("const head") && l.includes("goes to the host"));
  const rest = q3.filter((l) => !l.includes("const head"));
  if (head.length !== 1 || !rest.some((l) => l.includes("state: string | null"))) refuse("hostPort.ts: not the r27 x q3 shape");
  return [...head, ...rest];
}

const KEYS_Q3 = '["connection", "keyName", "loops", "loopsWebUrl", "paired", "pairing", "sharedKey", "transport"]';
const KEYS_IDLE = '["connection", "keyName", "loops", "loopsWebUrl", "paired", "pairing", "pairingIdleDays", "sharedKey", "transport"]';

/** F. apps/host/test/pairing.test.ts, r27 x q3: q3's two tests ported to the bearer, then r27's title for the link test. */
function pairingTest(a, b) {
  const title = [...a, ...b].filter((l) => l.includes("pairs once: the bearer"));
  if (title.length !== 1) refuse("pairing.test.ts: no r27 title");
  const q3 = a.length > b.length ? a : b;
  if (q3.length === 0 || !q3[q3.length - 1].includes("a link pairs once: the cookie shape")) refuse("pairing.test.ts: not the r27 x q3 shape");
  let text = q3.slice(0, -1).join("\n");
  text = text.replace(
    "    const { cookie } = await pair(host.mintPairLink());\n    const paired = JSON.parse((await status(`${host.url}/world-api/health`, { cookie })).body)",
    "    const { paired: header } = await pair(host.mintPairLink());\n    const paired = JSON.parse((await status(`${host.url}/world-api/health`, header)).body)",
  );
  text = text.replaceAll("status(`${host.url}/world-api/health`, { cookie })", "status(`${host.url}/world-api/health`, header)");
  text = text.replaceAll("const { cookie } = await pair(host.mintPairLink());", "const { paired } = await pair(host.mintPairLink());");
  text = text.replaceAll("{ origin: host.url, cookie }", "{ origin: host.url, ...paired }");
  text = text.replace(KEYS_Q3, KEYS_IDLE);
  if (text.includes("cookie")) refuse("pairing.test.ts: a cookie use the rule does not know");
  return [...text.split("\n"), ...title];
}

/** D. apps/host/README.md, r27 x q3: q3's paragraph, "cookie" -> "bearer". */
function readme(a, b) {
  const q3 = a.some((l) => l.includes("never to")) ? a : b;
  const out = q3.map((l) => l.replace("the page still needs its cookie", "the page still needs its bearer"));
  if (!out.some((l) => l.includes("bearer")) || out.some((l) => l.includes("cookie"))) refuse("README.md: not the r27 x q3 shape");
  return out;
}

const SETUP_FIRST = "The source setting is `auto`";
const SETUP_ZONES = "Zones: every live project";

/** A. apps/host/src/host.ts, q1 x q3: q3's comment without `const isPaired = paired(req);` (q1 declares isPaired above). */
function hostTs(a, b) {
  const q3 = a.some((l) => l.includes("const isPaired = paired(req);")) ? a : b;
  const other = q3 === a ? b : a;
  if (other.some((l) => l.trim() !== "")) refuse("host.ts: the other side is not empty, not the q1 x q3 shape");
  return q3.filter((l) => !l.includes("const isPaired = paired(req);"));
}

/** The rules, by the file they resolve; the letters are the plan's (G, LOOPS_SETUP.md against q8, retired in round 38: the branch carries the paragraphs, the merge is clean). */
export const RULES = {
  "apps/host/src/host.ts": { letter: "A", resolve: hostTs },
  "apps/host/README.md": { letter: "D", resolve: readme },
  "apps/world/hostPort.ts": { letter: "E", resolve: hostPort },
  "apps/host/test/pairing.test.ts": { letter: "F", resolve: pairingTest },
};

/** A file's text with its conflict blocks resolved by the plan's rule for that file; a Refusal otherwise. */
export function resolveText(file, text) {
  const rule = RULES[file];
  if (rule === undefined) refuse(`${file}: no rule for this file`);
  const { lines, blocks } = conflictBlocks(text);
  if (blocks.length === 0) refuse(`${file}: no conflict markers`);
  for (const block of [...blocks].reverse()) lines.splice(block.start, block.end - block.start + 1, ...rule.resolve(block.a, block.b));
  const out = lines.join("\n");
  if (out.includes("<<<<<<<") || out.includes(">>>>>>>")) refuse(`${file}: markers left`);
  return out;
}

/** C. After `tab`: the two LOOPS_SETUP.md paragraphs r27 once dropped must be there (the branch carries them since round 38). */
export function setupParagraphs(text) {
  if (!text.includes(SETUP_FIRST) || !text.includes(SETUP_ZONES)) refuse("docs/LOOPS_SETUP.md: the source-setting and zones paragraphs are missing after task/r27-tab-pairing (the branch dropped them again)");
  return true;
}

/** B. q3's test pins health's keys before pairing; r27 and q1 add pairingIdleDays to health (clean textual merge, red test). */
export function healthKeys(testText, hostText) {
  if (!hostText.includes("pairingIdleDays") || testText.includes(KEYS_IDLE)) return { text: testText, changed: false };
  if (testText.split(KEYS_Q3).length !== 2) refuse("health-keys: q3's key list not found once in pairing.test.ts");
  return { text: testText.replace(KEYS_Q3, KEYS_IDLE), changed: true };
}

// --- The program. ---

function main(argv) {
  const usage = "node tools/answers-replay.mjs <base> <tab|cookie+expiry|cookie> [q3] [q8] [q11] [q14] [q15] [--check]";
  const fail = (message) => {
    console.error(`${message}\n\nusage: ${usage}`);
    process.exit(2);
  };
  const [base, q1, ...rest] = argv;
  if (!base || !["tab", "cookie+expiry", "cookie"].includes(q1)) fail("the base and question 1's answer are required");
  let check = false;
  const chosen = [];
  for (const a of rest) {
    if (a === "--check") check = true;
    else if (ORDER.includes(a)) chosen.push(a);
    else fail(`unknown: ${a}`);
  }
  const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const short = () => git("rev-parse", "--short", "HEAD");
  const repo = git("rev-parse", "--show-toplevel");
  if (git("status", "--porcelain") !== "") fail("the tree is not clean");
  const merge = (key) => {
    const branch = BRANCHES[key];
    try {
      // The plain two-sided markers the rules read, whatever merge.conflictStyle the person's git config sets.
      git("-c", "merge.conflictStyle=merge", "merge", "--no-ff", "--no-edit", branch);
      console.log(`merged ${key} (${branch}): clean -> ${short()}`);
      return;
    } catch {
      // A conflict: resolve what the plan knows, file by file; anything else stops here with the merge left open.
    }
    const files = git("diff", "--name-only", "--diff-filter=U").split("\n").filter((f) => f !== "");
    for (const file of files) {
      const full = path.join(repo, file);
      let resolved;
      try {
        resolved = resolveText(file, readFileSync(full, "utf8"));
      } catch (error) {
        console.error(`answers-replay: ${error instanceof Error ? error.message : String(error)} (merge of ${branch} left open on ${file})`);
        process.exit(1);
      }
      writeFileSync(full, resolved);
      git("add", file);
      console.log(`resolved ${file} (rule ${RULES[file].letter})`);
    }
    git("-c", "core.editor=true", "commit", "-q", "--no-edit");
    console.log(`merged ${key} (${branch}): hand merge replayed on ${files.join(", ")} -> ${short()}`);
  };
  git("switch", "--detach", base);
  console.log(`base ${short()}`);
  for (const key of ORDER) if (chosen.includes(key)) merge(key);
  if (q1 === "tab") {
    merge("tab");
    const file = "docs/LOOPS_SETUP.md";
    try {
      setupParagraphs(readFileSync(path.join(repo, file), "utf8"));
      console.log("C: the LOOPS_SETUP.md paragraphs are there");
    } catch (error) {
      console.error(`answers-replay: ${error instanceof Error ? error.message : String(error)} (the result ${short()} stands, unmerged further)`);
      process.exit(1);
    }
  } else if (q1 === "cookie+expiry") {
    merge("cookie+expiry");
    const file = "apps/host/test/pairing.test.ts";
    const fixed = healthKeys(readFileSync(path.join(repo, file), "utf8"), readFileSync(path.join(repo, "apps/host/src/host.ts"), "utf8"));
    if (fixed.changed) {
      writeFileSync(path.join(repo, file), fixed.text);
      git("add", file);
      git("-c", "core.editor=true", "commit", "-q", "--amend", "--no-edit");
      console.log(`health keys fixed in the merge commit (B) -> ${short()}`);
    } else console.log("B: nothing to fix");
  }
  const result = git("rev-parse", "HEAD");
  console.log(`result ${result}`);
  if (check) {
    const out = path.join(repo, "tools", "out");
    mkdirSync(out, { recursive: true });
    const log = path.join(out, `answers-replay-check-${result.slice(0, 7)}.out`);
    try {
      writeFileSync(log, execFileSync("npm", ["run", "check"], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }));
      const counts = readFileSync(log, "utf8").split("\n").filter((l) => /ℹ (tests|pass|fail) /.test(l)).map((l) => l.trim()).join(", ");
      console.log(`npm run check: green (${counts}); log ${log}`);
    } catch (error) {
      writeFileSync(log, `${error.stdout ?? ""}\n${error.stderr ?? ""}`);
      console.error(`npm run check: RED, see ${log}`);
      process.exit(1);
    }
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main(process.argv.slice(2));

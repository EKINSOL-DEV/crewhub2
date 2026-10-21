/**
 * Is the built world (`apps/world/dist`) up to date with its sources? `npm run world` asks before it serves. The
 * check is cheap (one walk of about 500 files, some ten milliseconds) and errs on the side of a build: a missing
 * dist, a dist older than the newest source, or a source set that changed since the dist was built (a file deleted
 * or added, which an mtime comparison alone does not see: the stamp the host writes after its own build keeps the
 * count). The sources are the world's `src`, `index.html`, `vite.config.ts` and `package.json`, every package under
 * `packages/` (without node_modules, dist, tests and dotfiles) and the root `package-lock.json` (a dependency change
 * is a change). Pure where it decides: `freshness` takes the files; the walk and the build are separate.
 */
import { spawn } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface SourceFile {
  path: string;
  mtimeMs: number;
}

export interface BuildStamp {
  /** How many source files the build saw. */
  files: number;
  /** The newest source mtime the build saw. */
  newestMtimeMs: number;
}

export type Freshness = { fresh: true; reason: string } | { fresh: false; reason: string };

export const STAMP_FILE = ".crewhub-world-build.json";

/**
 * The verdict: `fresh` when the dist exists, is not older than the newest source, and (when a stamp is there) was
 * built from the same number of files with the same newest mtime. No stamp (a plain `npm run build`): the mtime decides.
 */
export function freshness(input: { distMtimeMs: number | null; sources: readonly SourceFile[]; stamp: BuildStamp | null }): Freshness {
  if (input.distMtimeMs === null) return { fresh: false, reason: "apps/world/dist is missing" };
  let newest = 0;
  let newestPath = "";
  for (const file of input.sources) {
    if (file.mtimeMs > newest) {
      newest = file.mtimeMs;
      newestPath = file.path;
    }
  }
  if (newest > input.distMtimeMs) return { fresh: false, reason: `${newestPath} is newer than apps/world/dist` };
  if (input.stamp !== null) {
    if (input.stamp.files !== input.sources.length) return { fresh: false, reason: `the source set changed (${input.sources.length} files, the build saw ${input.stamp.files})` };
    if (input.stamp.newestMtimeMs !== newest) return { fresh: false, reason: "a source changed since the build" };
  }
  return { fresh: true, reason: `apps/world/dist is up to date (${input.sources.length} source files checked)` };
}

/** The stamp of the sources as they are now, to write after a build. */
export function stampOf(sources: readonly SourceFile[]): BuildStamp {
  return { files: sources.length, newestMtimeMs: sources.reduce((max, f) => Math.max(max, f.mtimeMs), 0) };
}

const SKIP = new Set(["node_modules", "dist", "test"]);

function walk(dir: string, out: SourceFile[]): void {
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP.has(entry.name) || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) {
      try {
        out.push({ path: full, mtimeMs: statSync(full).mtimeMs });
      } catch {
        // gone meanwhile
      }
    }
  }
}

/** The world's sources under `repoRoot` (see the header), paths relative to the root. */
export function worldSources(repoRoot: string): SourceFile[] {
  const out: SourceFile[] = [];
  walk(path.join(repoRoot, "apps", "world", "src"), out);
  walk(path.join(repoRoot, "packages"), out);
  for (const file of ["apps/world/index.html", "apps/world/vite.config.ts", "apps/world/package.json", "package-lock.json"]) {
    try {
      out.push({ path: path.join(repoRoot, file), mtimeMs: statSync(path.join(repoRoot, file)).mtimeMs });
    } catch {
      // not there: not a source then
    }
  }
  return out.map((f) => ({ path: path.relative(repoRoot, f.path), mtimeMs: f.mtimeMs }));
}

/** The dist's `index.html` mtime, or null; and the stamp, when the host wrote one after its own build. */
export function distState(distDir: string): { distMtimeMs: number | null; stamp: BuildStamp | null } {
  let distMtimeMs: number | null = null;
  try {
    distMtimeMs = statSync(path.join(distDir, "index.html")).mtimeMs;
  } catch {
    distMtimeMs = null;
  }
  let stamp: BuildStamp | null = null;
  try {
    const parsed = JSON.parse(readFileSync(path.join(distDir, STAMP_FILE), "utf8")) as Partial<BuildStamp>;
    if (typeof parsed.files === "number" && typeof parsed.newestMtimeMs === "number") stamp = { files: parsed.files, newestMtimeMs: parsed.newestMtimeMs };
  } catch {
    stamp = null;
  }
  return { distMtimeMs, stamp };
}

/** The whole check on disk, timed: for the step line "apps/world/dist is up to date (480 files, 9 ms)". */
export function checkBuild(repoRoot: string, distDir: string): Freshness & { ms: number; sources: SourceFile[] } {
  const started = performance.now();
  const sources = worldSources(repoRoot);
  const verdict = freshness({ ...distState(distDir), sources });
  return { ...verdict, ms: performance.now() - started, sources };
}

/**
 * `npm run build` in `repoRoot`, its output passed line by line to `onLine` (vite's lines, for the terminal), the
 * stamp written after a success. Resolves with the exit code and the time; never throws.
 */
export function buildWorld(repoRoot: string, distDir: string, onLine: (line: string) => void): Promise<{ code: number; ms: number }> {
  const started = performance.now();
  return new Promise((resolve) => {
    const child = spawn("npm", ["run", "build"], { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] });
    const feed = (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n")) if (line.trim() !== "") onLine(line);
    };
    child.stdout.on("data", feed);
    child.stderr.on("data", feed);
    child.on("error", () => resolve({ code: 1, ms: performance.now() - started }));
    child.on("exit", (code) => {
      if (code === 0) {
        try {
          writeFileSync(path.join(distDir, STAMP_FILE), JSON.stringify(stampOf(worldSources(repoRoot))) + "\n");
        } catch {
          // no stamp: the mtime check still decides next time
        }
      }
      resolve({ code: code ?? 1, ms: performance.now() - started });
    });
  });
}

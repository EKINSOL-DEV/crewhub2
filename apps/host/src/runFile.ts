/*
 * The run file: `$TMPDIR/crewhub-world-host-<port>.json`, mode 0600 in the user's temp folder, written by `npm run host`
 * and `npm run world` with the host's pid, URL, the mint secret and whether it serves the built world (`world`, design
 * choice H2: `npm run world` refuses to open a browser on a development host), removed at exit. A program of the same
 * user reads the secret from it to mint a pairing link (`open`) or to tell the host a dev origin (`npm run dev`,
 * round 26): the file's mode is what makes "can read it" mean "the same user".
 */
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const runFilePath = (port: number): string => path.join(tmpdir(), `crewhub-world-host-${port}.json`);

export interface RunFile {
  pid: number;
  url: string;
  mintSecret: string;
  /** Whether this host serves the built world (`npm run world`); false for `npm run host`; absent in a file from before. */
  world?: boolean;
}

/** The run file of the host on `port`, or null when there is none, it is unreadable or not the file's shape. */
export function readRunFile(port: number): RunFile | null {
  let text: string;
  try {
    text = readFileSync(runFilePath(port), "utf8");
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(text) as Partial<RunFile>;
    if (typeof parsed.pid !== "number" || typeof parsed.url !== "string" || typeof parsed.mintSecret !== "string" || parsed.mintSecret === "") return null;
    return { pid: parsed.pid, url: parsed.url, mintSecret: parsed.mintSecret, ...(typeof parsed.world === "boolean" ? { world: parsed.world } : {}) };
  } catch {
    return null;
  }
}

/**
 * Writes the run file (mode 0600) and removes it at any exit of the process: the signal handlers' `process.exit(0)`,
 * `npm run world`'s failed build (`process.exit(1)`) and an uncaught error alike (round 50, r48-review F16: only the
 * signal handlers removed it). The removal leaves a file another process wrote since. Returns the removal, for a caller
 * that stops the host and goes on running.
 */
export function writeRunFile(port: number, file: RunFile): () => void {
  const where = runFilePath(port);
  writeFileSync(where, JSON.stringify(file) + "\n", { mode: 0o600 });
  const remove = () => {
    process.off("exit", remove);
    if (readRunFile(port)?.pid !== file.pid) return;
    try {
      unlinkSync(where);
    } catch {
      // Already gone.
    }
  };
  process.on("exit", remove);
  return remove;
}

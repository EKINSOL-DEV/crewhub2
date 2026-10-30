/*
 * The run file: `$TMPDIR/crewhub-world-host-<port>.json`, mode 0600 in the user's temp folder, written by `npm run host`
 * and `npm run world` with the host's pid, URL and the mint secret, removed at exit. A program of the same user reads
 * the secret from it to mint a pairing link (`open`) or to tell the host a dev origin (`npm run dev`, round 26): the
 * file's mode is what makes "can read it" mean "the same user".
 */
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const runFilePath = (port: number): string => path.join(tmpdir(), `crewhub-world-host-${port}.json`);

export interface RunFile {
  pid: number;
  url: string;
  mintSecret: string;
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
    return { pid: parsed.pid, url: parsed.url, mintSecret: parsed.mintSecret };
  } catch {
    return null;
  }
}

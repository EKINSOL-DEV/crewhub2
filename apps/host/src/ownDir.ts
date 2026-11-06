/*
 * The host's own folder (CREWHUB_WORLD_CONFIG_DIR, or ~/.config/crewhub-world): design choice H1 (round 72, `warn`).
 * The host makes it 0700 when it is not there; a folder that exists is left as it is (CREWHUB_WORLD_CONFIG_DIR=~ once
 * made the home folder 0700), and the start log says once, as the doctor warns, when it is looser than 0700. The
 * files inside (the stored key, the pairing secret, the database) are 0600 either way.
 */
import { chmodSync, mkdirSync, statSync } from "node:fs";

export interface OwnDir {
  /** The folder was made now (0700). */
  made: boolean;
  /** An existing folder's permission bits when it is looser than 0700 (group or others have any bit); null otherwise. */
  loose: number | null;
}

/** The folder's permission bits, or null when it is not there. */
export function ownDirMode(dir: string): number | null {
  try {
    return statSync(dir).mode & 0o777;
  } catch {
    return null;
  }
}

/** Makes `dir` (0700) when it is not there; an existing folder keeps its mode and is reported when loose. */
export function ensureOwnDir(dir: string): OwnDir {
  const mode = ownDirMode(dir);
  if (mode === null) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
    return { made: true, loose: null };
  }
  return { made: false, loose: (mode & 0o077) !== 0 ? mode : null };
}

const octal = (mode: number) => `0${(mode & 0o777).toString(8).padStart(3, "0")}`;

/** The one line the start log and the doctor say about an existing folder looser than 0700. */
export const looseFolderLine = (dir: string, mode: number): string => `config folder ${dir} is mode ${octal(mode)}, looser than 0700: the host leaves it as it is (chmod 700 "${dir}" makes it private)`;

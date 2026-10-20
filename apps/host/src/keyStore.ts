/**
 * The host's own stored key: `<configDir>/loops-key`, the folder 0700 and the file 0600, written whole (a temp file
 * and a rename) and never logged. These and `forget` are the host's only writes, and they are to its own folder.
 */
import { chmodSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { STORED_KEY_NAME } from "./config.ts";

export interface KeyStore {
  /** The file the key is kept in. For the log; never the key. */
  file: string;
  save(key: string): void;
  /** Removes the stored key; nothing to remove is fine. */
  forget(): void;
}

export function createKeyStore(configDir: string): KeyStore {
  const file = path.join(configDir, STORED_KEY_NAME);
  return {
    file,
    save(key) {
      mkdirSync(configDir, { recursive: true, mode: 0o700 });
      chmodSync(configDir, 0o700);
      const temp = `${file}.${process.pid}.tmp`;
      writeFileSync(temp, `${key}\n`, { mode: 0o600 });
      chmodSync(temp, 0o600);
      renameSync(temp, file);
    },
    forget() {
      try {
        unlinkSync(file);
      } catch {
        // already gone
      }
    },
  };
}

/**
 * What an older host left in the config folder and this one no longer uses (round 19): the person's chat session file
 * `<config>/loops-session` of the session road (removed with the switch to the viewer key, decision 9). It is deleted on
 * start with one log line, so no cookie of a person lingers on disk for a road that is gone. Nothing else is touched.
 */
import path from "node:path";
import { existsSync, unlinkSync } from "node:fs";

export const SESSION_FILE_NAME = "loops-session";

/** Deletes a leftover session file under `configDir`, if there is one; true when one was removed. Never throws. */
export function removeLeftoverSession(configDir: string, log: (line: string) => void): boolean {
  const file = path.join(configDir, SESSION_FILE_NAME);
  if (!existsSync(file)) return false;
  try {
    unlinkSync(file);
    log(`removed the leftover chat session file ${file}: the sign-in road went with the switch to the viewer key (round 19); the bubbles come over the world's own key where crewhub-loops lets it read the chat`);
    return true;
  } catch (error) {
    log(`could not remove the leftover chat session file ${file} (${error instanceof Error ? error.message : String(error)}); delete it by hand, nothing reads it any more`);
    return false;
  }
}

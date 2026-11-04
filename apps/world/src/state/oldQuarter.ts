/* The "Old quarter" setting: archived buildings are folded away into a row of their own behind the town instead of
   standing boarded up on their plots. Off by default: a building keeps its place, archived or not. Kept per viewer in
   this browser (state/setting.ts); it changes what this viewer sees, never the town document. */
import { createSetting, onOff } from "./setting.ts";

export const oldQuarter = createSetting<boolean>({ key: "crewhub-world.old-quarter", ...onOff });
export const useOldQuarter = oldQuarter.use;
export const setOldQuarter = oldQuarter.set;

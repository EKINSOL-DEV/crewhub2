/* The "details" toggle: off shows a name pill and at most one bubble per robot and one name sign per building; on shows
   every label (room signs, rule chips, update cards, waiting tags, counts). Kept in this browser (state/setting.ts). The
   text view always shows everything. */
import { createSetting, onOff, toggle } from "./setting.ts";

export const details = createSetting<boolean>({ key: "crewhub-world.details", ...onOff });
export const useDetails = details.use;
export const toggleDetails = () => toggle(details);

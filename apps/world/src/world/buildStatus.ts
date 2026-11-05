/* Build mode's status line in words (the sheet's first sentence, read by the live region with the message under it).
   Round 65, w6-2: a refused placement said its reason twice, the status "<prop> can't stand here: <reason>" and the
   message "Can't place <prop> here: <reason>", and the live region both; the status yields to a message that ends
   with the same reason, so it is read once (the message, the action's, is kept). Pure. */
import { buildWords } from "../state/inputWords.ts";
import type { GhostCheck } from "./placements";

export const ROTATION_WORDS = ["facing the camera", "turned a quarter", "turned half", "turned three quarters"] as const;

export interface BuildStatusFacts {
  inside: boolean;
  /** The selected placement: its prop's name and its rotation. */
  selected: { name: string; rotation: 0 | 1 | 2 | 3 } | null;
  /** The chosen catalogue prop's name. */
  chosen: string | null;
  check: GhostCheck | null;
  /** The last thing build mode said (BuildState.message). */
  message: string;
  /** The words by input kind (state/inputWords.ts, w4-2); the pointer's when left out. */
  words?: Pick<ReturnType<typeof buildWords>, "idle" | "point">;
}

/** The status sentence, or "" when the message under it already says the same reason. */
export function buildStatusLine({ inside, selected, chosen, check, message, words = buildWords(false) }: BuildStatusFacts): string {
  if (!inside) return "Enter a building to place props.";
  if (selected) return `${selected.name} selected, ${ROTATION_WORDS[selected.rotation]}.`;
  if (!chosen) return words.idle;
  if (!check) return `${chosen}: ${words.point}`;
  if (check.ok) return `${chosen} fits here.`;
  if (message !== "" && message.endsWith(check.reason)) return "";
  return `${chosen} can't stand here: ${check.reason}`;
}

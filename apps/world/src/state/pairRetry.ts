/* The Pair screen's "I opened the link" (walk finding w2-7, round 65): the button asks the host again, and the screen
   re-asks every 2.5 s anyway, so a press made before any link was opened changed nothing on screen and the button
   looked dead. Now a line under the button says the browser is still not paired, once the read that landed after the
   press has come (the Pair screen still standing means the host still says so). Pure; the screen is components/PairPage.tsx. */

/** The line is due: a press happened, and a read of the host's health landed at or after it. */
export function stillUnpaired(pressedAt: number | null, read: { at: number } | null): boolean {
  return pressedAt !== null && read !== null && read.at >= pressedAt;
}

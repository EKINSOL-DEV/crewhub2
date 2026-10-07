/* The connection chip of live mode: where the Demo chip stands in demo mode. It says how the live source stands with
   its host and the host with crewhub-loops (`ConnectionState`): Connecting, Live, Catching up, Stale, Loops down,
   Unauthorized. Stale is the watchdog's muted chip; Loops down and Unauthorized the attention chip; the rest a plain
   chip. Copy from the i18n file. */
import { Radio } from "lucide-react";
import type { ConnectionState } from "@crewhub/loops-client";
import { translate } from "../i18n";
import { Chip } from "./primitives";

/** The chip's word for a state. */
export const connectionWord = (state: ConnectionState) => translate(`world.connection.${state}`);
/** The text view's one line. */
export const connectionLine = (state: ConnectionState) => translate("world.connection.text", { state: connectionWord(state) });

export function ConnectionChip({ state }: { state: ConnectionState }) {
  const word = connectionWord(state);
  const hint = translate(`world.connection.hint.${state}`);
  const label = translate("world.connection.label", { state: word });
  if (state === "stale")
    return (
      <span className="connection-chip" data-connection={state} role="status" aria-label={label}>
        <Chip.Stalled title={hint}>{word}</Chip.Stalled>
      </span>
    );
  if (state === "loops-down" || state === "unauthorized")
    return (
      <span className="connection-chip" data-connection={state} role="status" aria-label={label}>
        <Chip.Attention title={hint}>{word}</Chip.Attention>
      </span>
    );
  return (
    <Chip className="connection-chip" data-connection={state} role="status" aria-label={label} title={hint} icon={<Radio className="icon icon-sm" aria-hidden="true" />}>
      {word}
    </Chip>
  );
}

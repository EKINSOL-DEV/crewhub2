/* The connection chip of live mode: where the Demo chip stands in demo mode. It says how the live source stands with
   its host and the host with crewhub-loops (`ConnectionState`): Connecting, Live, Catching up, Stale, Loops down,
   Unauthorized. Stale is the watchdog's muted chip; Loops down and Unauthorized the attention chip; the rest a plain
   chip. With `onOpen` the chip is a button that opens the Connection panel (ConnectionPanel.tsx). Copy from the i18n file. */
import { Radio } from "lucide-react";
import type { ConnectionState } from "@crewhub/loops-client";
import { translate } from "../i18n";
import { Chip } from "./primitives";

/** The chip's word for a state. */
export const connectionWord = (state: ConnectionState) => translate(`world.connection.${state}`);
/** The text view's one line. */
export const connectionLine = (state: ConnectionState) => translate("world.connection.text", { state: connectionWord(state) });

export function ConnectionChip({ state, onOpen, open, ref }: { state: ConnectionState; onOpen?: () => void; open?: boolean; ref?: React.Ref<HTMLButtonElement> }) {
  const word = connectionWord(state);
  const hint = translate(`world.connection.hint.${state}`);
  const label = translate("world.connection.label", { state: word });
  // Inside the button the title sits on the button itself, so the chip carries none.
  const chip =
    state === "stale" ? (
      onOpen ? <Chip.Stalled>{word}</Chip.Stalled> : <Chip.Stalled title={hint}>{word}</Chip.Stalled>
    ) : state === "loops-down" || state === "unauthorized" ? (
      onOpen ? <Chip.Attention>{word}</Chip.Attention> : <Chip.Attention title={hint}>{word}</Chip.Attention>
    ) : (
      <Chip title={onOpen ? undefined : hint} icon={<Radio className="icon icon-sm" aria-hidden="true" />}>
        {word}
      </Chip>
    );
  if (onOpen)
    return (
      <button ref={ref} type="button" className="chip-button connection-chip" data-connection={state} aria-label={translate("world.connection.open", { state: label })} title={hint} aria-expanded={open ?? false} aria-haspopup="dialog" onClick={onOpen}>
        {chip}
      </button>
    );
  return (
    <span className="connection-chip" data-connection={state} role="status" aria-label={label}>
      {chip}
    </span>
  );
}

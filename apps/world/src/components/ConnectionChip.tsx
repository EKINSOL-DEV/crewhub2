/* The connection chip of live mode: where the Demo chip stands in demo mode. It says how the live source stands with
   its host and the host with crewhub-loops (`ConnectionState`): Connecting, Live, Catching up, Stale, Loops down,
   Unauthorized, Stream busy (loops' 429: another host or tab uses the key), Pair again (the host answered 401 not_paired;
   the App shows the Pair screen then). Stale and Stream busy are the watchdog's muted chip; Loops down, Unauthorized and
   Pair again the attention chip; the rest a plain chip. With `onOpen` the chip is a button that opens the Connection panel (ConnectionPanel.tsx). Copy from the i18n file.
   The words and the tone are components/connectionWords.ts (Vite-free, held by a node test); App and the panel import the words from here as before. */
import { Radio } from "lucide-react";
import type { ConnectionState } from "@crewhub/loops-client";
import { translate } from "../i18n";
import { chipTone, connectionHint, connectionLine, connectionWord } from "./connectionWords";
import { Chip } from "./primitives";

export { connectionHint, connectionLine, connectionWord };

export function ConnectionChip({ state, reason = null, onOpen, open, ref }: { state: ConnectionState; /** The host's own words on a host-tabs or host-failed state. */ reason?: string | null; onOpen?: () => void; open?: boolean; ref?: React.Ref<HTMLButtonElement> }) {
  const word = connectionWord(state);
  const hint = connectionHint(state, reason);
  const label = translate("world.connection.label", { state: word });
  const tone = chipTone(state);
  // Inside the button the title sits on the button itself, so the chip carries none.
  const chip =
    tone === "stalled" ? (
      onOpen ? <Chip.Stalled>{word}</Chip.Stalled> : <Chip.Stalled title={hint}>{word}</Chip.Stalled>
    ) : tone === "attention" ? (
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

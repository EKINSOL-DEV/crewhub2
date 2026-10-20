/* The "Pair this browser" screen (plan 3.5): shown instead of the world when live mode is chosen, the host answered, pairing
   is on and this browser carries no pairing cookie (state/connect.ts `connectScreen` → "pair"). It names the command to run
   where the host runs, in a code chip with a copy button; it never shows a link itself (the host prints the one-time link
   on the terminal, and it is single use). "Use the demo" keeps the demo as this browser's source and reloads; "I opened the
   link" asks the host again. Copy from the i18n file; the kit's Card and Button. `PairContent` is the body and footer the
   Connect page (ConnectPage.tsx) shows for this state (a host from before the smooth connection lands there too). */
import { Check, Copy, Link2 } from "lucide-react";
import { useState } from "react";
import { useT } from "../i18n";
import { hrefWithoutOverride, writeSourceSetting } from "../state/source";
import { Button, Card } from "./primitives";

/** "Use the demo": the demo becomes this browser's source and the page reloads without the override. */
export function switchToDemo(): void {
  writeSourceSetting("demo");
  globalThis.location.assign(hrefWithoutOverride(globalThis.location));
}

export function PairContent({ onRetry }: { onRetry: () => void }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const command = t("world.pair.command");
  const copy = () => {
    const clipboard = globalThis.navigator?.clipboard;
    if (!clipboard) return;
    clipboard.writeText(command).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => setCopied(false),
    );
  };
  return (
    <>
      <Card.Body>
        <p className="pair-lead">{t("world.pair.lead")}</p>
        <div className="pair-command">
          <code className="pair-code">{command}</code>
          <Button size="sm" variant="ghost" onClick={copy} icon={copied ? <Check className="icon icon-sm" aria-hidden="true" /> : <Copy className="icon icon-sm" aria-hidden="true" />} aria-live="polite">
            {copied ? t("world.pair.copied") : t("world.pair.copy")}
          </Button>
        </div>
        <p className="hint pair-note">{t("world.pair.note")}</p>
      </Card.Body>
      <Card.Footer>
        <Button variant="primary" onClick={onRetry} icon={<Link2 className="icon icon-sm" aria-hidden="true" />}>
          {t("world.pair.retry")}
        </Button>
        <Button onClick={switchToDemo}>{t("world.pair.demo")}</Button>
      </Card.Footer>
    </>
  );
}

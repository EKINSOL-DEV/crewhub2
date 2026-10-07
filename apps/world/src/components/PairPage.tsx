/* The "Pair this browser" page (plan 3.5): shown instead of the world when live mode is chosen, the host answered, pairing
   is on and this browser carries no pairing cookie (state/source.ts `needsPairing`). It names the command to run where the
   host runs, in a code chip with a copy button; it never shows a link itself (the host prints the one-time link on the
   terminal, and it is single use). "Use the demo" keeps the demo as this browser's source and reloads; "I opened the link"
   reloads to ask the host again. Copy from the i18n file; the kit's Card and Button. */
import { Check, Copy, Link2 } from "lucide-react";
import { useState } from "react";
import { useT } from "../i18n";
import { hrefWithoutOverride, writeSourceSetting } from "../state/source";
import { Button, Card } from "./primitives";

export function PairPage() {
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
  const useDemo = () => {
    writeSourceSetting("demo");
    globalThis.location.assign(hrefWithoutOverride(globalThis.location));
  };
  const retry = () => globalThis.location.reload();
  return (
    <main className="pair-page" aria-labelledby="pair-title" aria-label={t("world.pair.label")}>
      <Card className="pair-card">
        <Card.Header title={t("world.pair.title")} titleId="pair-title" />
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
          <Button variant="primary" onClick={retry} icon={<Link2 className="icon icon-sm" aria-hidden="true" />}>
            {t("world.pair.retry")}
          </Button>
          <Button onClick={useDemo}>{t("world.pair.demo")}</Button>
        </Card.Footer>
      </Card>
    </main>
  );
}

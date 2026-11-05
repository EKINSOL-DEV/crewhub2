/* The "Pair this browser" screen (plan 3.5): shown instead of the world when live mode is chosen, the host answered, pairing
   is on and this browser carries no pairing cookie (state/connect.ts `connectScreen` → "pair"). It names the command to run
   where the host runs, in a code chip with a copy button; it never shows a link itself (the host prints the one-time link
   on the terminal, and it is single use). "Use the demo" keeps the demo as this browser's source and reloads; "I opened the
   link" asks the host again. Copy from the i18n file; the kit's Card and Button. `PairContent` is the body and footer the
   Connect page (ConnectPage.tsx) shows for this state (a host from before the smooth connection lands there too). */
import { Check, Copy, Link2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createCopyFlash, type CopyFlash } from "../state/copyFlash";
import { useHealthView } from "../state/health";
import { stillUnpaired } from "../state/pairRetry";
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
  // A failed copy says so, and the timer that turns "Copied" back goes with the screen (state/copyFlash.ts, round 50).
  const [failed, setFailed] = useState(false);
  const flash = useRef<CopyFlash | null>(null);
  useEffect(() => {
    const own = createCopyFlash((state) => {
      setCopied(state === "copied");
      setFailed(state === "failed");
    });
    flash.current = own;
    return () => own.dispose();
  }, []);
  const copy = () => void flash.current?.copy(globalThis.navigator?.clipboard, command);
  // "I opened the link" pressed before any link was opened (walk finding w2-7): once the host has answered again and this
  // screen still stands, a line under the button says so (state/pairRetry.ts); a polite region, so it is said too.
  const view = useHealthView();
  const [pressedAt, setPressedAt] = useState<number | null>(null);
  const retry = () => {
    setPressedAt(Date.now());
    onRetry();
  };
  const still = stillUnpaired(pressedAt, view.read);
  return (
    <>
      <Card.Body>
        <p className="pair-lead">{t("world.pair.lead")}</p>
        <div className="pair-command">
          <code className="pair-code">{command}</code>
          <Button size="sm" variant="ghost" onClick={copy} icon={copied ? <Check className="icon icon-sm" aria-hidden="true" /> : <Copy className="icon icon-sm" aria-hidden="true" />} aria-live="polite">
            {copied ? t("world.pair.copied") : failed ? t("world.pair.copyFailed") : t("world.pair.copy")}
          </Button>
        </div>
        <p className="hint pair-note">{t("world.pair.note")}</p>
      </Card.Body>
      <Card.Footer>
        <Button variant="primary" onClick={retry} icon={<Link2 className="icon icon-sm" aria-hidden="true" />}>
          {t("world.pair.retry")}
        </Button>
        <Button onClick={switchToDemo}>{t("world.pair.demo")}</Button>
        <p className="hint pair-still" role="status" aria-live="polite">
          {still ? t("world.pair.still") : ""}
        </p>
      </Card.Footer>
    </>
  );
}

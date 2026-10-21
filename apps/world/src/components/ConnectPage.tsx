/* The Connect screens (spec addendum "a smooth connection"): one screen per state of the host's connection, shown instead of
   the town until the host has loops, this browser is paired and a key is accepted (state/connect.ts `connectScreen`). The page
   polls the host's health every few seconds, so starting the app, pairing or a key the host checks all move the screen by
   themselves; the gate (main.tsx) swaps in the world when the screen is gone. The key field holds a pasted key in component
   state only, masked, until the request is sent and not a moment longer; the page never shows more than its last four
   characters. Copy from the i18n file; the kit's Card, Button and Field; the Pair screen's content comes from PairPage.tsx.
   One live region (sr-only, always mounted) says each screen once as it arrives (its title and one line) and the answer to
   a pasted key; the words that tick ("last asked 3 s ago") are not live, so a screen reader is never read a clock. */
import { ExternalLink, KeyRound, RefreshCw, ShieldAlert, Search, Unplug } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { connectHost, forgetHostKey, probeHost, type HostHealth } from "@crewhub/loops-client";
import { useT } from "../i18n";
import { connectOutcome, keyTail, looksLikeKey, normaliseKey, relativeTime, untilTime, type ConnectOutcome, type ConnectScreen } from "../state/connect";
import { loopsWebUrl } from "../state/source";
import { PairContent, switchToDemo } from "./PairPage";
import { Button, Card, Field } from "./primitives";

/** The loops web's own words in a step are marked **like this** in the copy and set in bold here. */
function emphasised(text: string) {
  return text.split("**").map((part, index) => (index % 2 === 1 ? <strong key={index}>{part}</strong> : part));
}

/** How often the page asks the host while a screen shows; the host itself looks for loops every 5 s. */
export const CONNECT_POLL_MS = 2500;
/** The loops web page where an external bot is made (apps/web/src/routes.tsx: /settings/agents). */
export const LOOPS_AGENTS_PATH = "/settings/agents";

interface ConnectPageProps {
  screen: ConnectScreen;
  health: HostHealth;
  /** A fresh health answer; the gate recomputes the screen from it. */
  onHealth: (health: HostHealth) => void;
  pollMs?: number;
}

export function ConnectPage({ screen, health, onHealth, pollMs = CONNECT_POLL_MS }: ConnectPageProps) {
  const { t } = useT();
  const [askedAt, setAskedAt] = useState<number>(() => Date.now());
  const [now, setNow] = useState<number>(() => Date.now());
  const [outcome, setOutcome] = useState<ConnectOutcome | "sent" | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgetting, setForgetting] = useState<"busy" | "done" | string | null>(null);
  const [spoken, setSpoken] = useState("");
  const live = useRef(true);

  const ask = useCallback(async () => {
    const fresh = await probeHost("", 1500);
    if (!live.current) return;
    setAskedAt(Date.now());
    if (fresh !== null) onHealth(fresh);
  }, [onHealth]);

  useEffect(() => {
    live.current = true;
    // Ask at once: over a live tab (the key revoked while Live) the health the App holds is from before, without
    // loops' reason; the gate's screens get a fresh read too, which costs one request.
    void ask();
    const timer = setInterval(() => void ask(), pollMs);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      live.current = false;
      clearInterval(timer);
      clearInterval(clock);
    };
  }, [ask, pollMs]);

  // A new screen from the host (checking → rejected, or the town) makes the last request's words stale.
  useEffect(() => {
    setOutcome(null);
  }, [screen]);

  const submit = useCallback(
    async (key: string) => {
      setBusy(true);
      setOutcome("sent");
      const answer = await connectHost(key);
      if (!live.current) return;
      setBusy(false);
      const result = connectOutcome(answer.status, answer.body);
      setOutcome(result);
      void ask();
    },
    [ask],
  );

  /** The rejected screen's "Forget this key": the host drops its stored key and this screen becomes the Connect screen. */
  const forget = useCallback(async () => {
    setForgetting("busy");
    const answer = await forgetHostKey();
    if (!live.current) return;
    const result = connectOutcome(answer.status, answer.body);
    setForgetting(result.kind === "ok" ? "done" : result.kind === "not-paired" ? t("world.connect.key.notPaired") : (result.reason ?? t("world.connect.key.failed")));
    void ask();
  }, [ask, t]);

  const title =
    screen === "no-loops"
      ? t("world.connect.noLoops.title")
      : screen === "pair"
        ? t("world.pair.title")
        : screen === "checking"
          ? t("world.connect.checking.title")
          : screen === "rejected"
            ? t("world.connect.rejected.title")
            : screen === "loops-down"
              ? t("world.connect.loopsDown.title")
              : t("world.connect.connect.title");
  const Icon = screen === "no-loops" ? Search : screen === "rejected" ? ShieldAlert : screen === "checking" ? RefreshCw : screen === "loops-down" ? Unplug : KeyRound;
  const connection = health.connection;
  const asked = relativeTime(new Date(askedAt).toISOString(), now);
  // The road, in the panel's words ("through the Mac app's socket"): the raw path is a detail for the Connection panel.
  const where = connection?.discovery.via ? t("world.connect.connect.where", { via: t(`world.connection.panel.via.${connection.discovery.via}`) }) : "";
  const reason = connection?.key.reason;
  const words = outcomeWords(outcome, t);

  // What the live region says: the screen as it arrives (set after the commit, so it is a change the reader notices),
  // then the key's answer or the forgetting's, each once.
  useEffect(() => {
    const lead =
      screen === "no-loops"
        ? t("world.connect.noLoops.lead")
        : screen === "pair"
          ? t("world.pair.lead")
          : screen === "checking"
            ? t("world.connect.checking.lead")
            : screen === "rejected"
              ? reason
                ? t("world.connect.rejected.reason", { reason })
                : t("world.connect.rejected.fallback")
              : screen === "loops-down"
                ? t("world.connect.loopsDown.hint")
                : t("world.connect.connect.paste");
    setSpoken(t("world.connect.spoken", { title, lead }));
  }, [screen, reason, title, t]);
  useEffect(() => {
    if (words) setSpoken(words);
  }, [words]);
  useEffect(() => {
    if (forgetting !== null && forgetting !== "busy") setSpoken(forgetting === "done" ? t("world.connect.rejected.forgotten") : t("world.connection.panel.forgetFailed", { reason: forgetting }));
  }, [forgetting, t]);

  return (
    <main className="pair-page connect-page" data-screen={screen} aria-labelledby="connect-title">
      <p className="sr-only" role="status" aria-live="polite">
        {spoken}
      </p>
      <Card className="pair-card connect-card">
        <Card.Header
          title={
            <>
              <Icon className="icon connect-title-icon" aria-hidden="true" data-spin={screen === "checking" ? "" : undefined} />
              {title}
            </>
          }
          titleId="connect-title"
        />
        {screen === "pair" && <PairContent onRetry={() => void ask()} />}
        {screen === "no-loops" && (
          <>
            <Card.Body>
              <p className="pair-lead">{t("world.connect.noLoops.lead")}</p>
              <p className="connect-sub">{t("world.connect.noLoops.looksFor")}</p>
              <ol className="connect-steps">
                <li>{t("world.connect.noLoops.envRoad")}</li>
                <li>{t("world.connect.noLoops.appSocket")}</li>
                <li>{t("world.connect.noLoops.appPort")}</li>
              </ol>
              <p className="hint pair-note">{t("world.connect.noLoops.note")}</p>
              <p className="connect-status">{asked === "just now" ? t("world.connect.noLoops.lookingNow") : t("world.connect.noLoops.looking", { ago: asked ?? "" })}</p>
            </Card.Body>
            <Card.Footer>
              <Button variant="primary" onClick={() => void ask()} icon={<RefreshCw className="icon icon-sm" aria-hidden="true" />}>
                {t("world.connect.noLoops.again")}
              </Button>
              <Button onClick={switchToDemo}>{t("world.connect.demo")}</Button>
            </Card.Footer>
          </>
        )}
        {screen === "loops-down" && (
          <>
            <Card.Body>
              <p className="pair-lead">{t("world.connect.loopsDown.lead", { where })}</p>
              {connection?.key.state === "unchecked" && <p className="connect-sub">{t("world.connect.loopsDown.unchecked")}</p>}
              <p className="hint pair-note">{t("world.connect.loopsDown.hint")}</p>
              <p className="connect-status">{asked === "just now" ? t("world.connect.noLoops.lookingNow") : t("world.connect.loopsDown.waiting", { ago: asked ?? "" })}</p>
            </Card.Body>
            <Card.Footer>
              <Button variant="primary" onClick={() => void ask()} icon={<RefreshCw className="icon icon-sm" aria-hidden="true" />}>
                {t("world.connect.noLoops.again")}
              </Button>
              <Button onClick={switchToDemo}>{t("world.connect.demo")}</Button>
            </Card.Footer>
          </>
        )}
        {(screen === "connect" || screen === "checking" || screen === "rejected") && (
          <>
            <Card.Body>
              {screen === "rejected" ? (
                <>
                  <p className="pair-lead connect-rejected">
                    {connection?.key.reason ? t("world.connect.rejected.reason", { reason: connection.key.reason }) : t("world.connect.rejected.fallback")}
                  </p>
                  {connection?.key.source && <p className="hint pair-note">{t("world.connect.rejected.source", { source: t(`world.connect.source.${connection.key.source}`) })}</p>}
                  <p className="connect-sub">{t("world.connect.rejected.fix")}</p>
                  {untilTime(connection?.key.recheckAt, now) && <p className="hint pair-note">{t("world.connect.rejected.recheck", { when: untilTime(connection?.key.recheckAt, now) ?? "" })}</p>}
                  {connection?.key.source === "stored" && (
                    <div className="connect-forget">
                      <p className="hint pair-note">{t("world.connect.rejected.kept")}</p>
                      <Button variant="danger" size="sm" disabled={forgetting === "busy"} onClick={() => void forget()}>
                        {forgetting === "busy" ? t("world.connect.rejected.forgetBusy") : t("world.connect.rejected.forget")}
                      </Button>
                      {forgetting !== null && forgetting !== "busy" && (
                        <p className={forgetting === "done" ? "connect-status" : "connect-status connect-rejected"}>
                          {forgetting === "done" ? t("world.connect.rejected.forgotten") : t("world.connection.panel.forgetFailed", { reason: forgetting })}
                        </p>
                      )}
                    </div>
                  )}
                </>
              ) : screen === "checking" ? (
                <p className="pair-lead">{t("world.connect.checking.lead")}</p>
              ) : (
                <>
                  <p className="pair-lead">{t("world.connect.connect.lead", { where })}</p>
                  <ol className="connect-steps">
                    <li>{emphasised(t("world.connect.connect.step1"))}</li>
                    <li>{emphasised(t("world.connect.connect.step2"))}</li>
                    <li>{emphasised(t("world.connect.connect.step3"))}</li>
                  </ol>
                </>
              )}
              <div className="connect-open">
                <Button href={`${loopsWebUrl(health)}${LOOPS_AGENTS_PATH}`} target="_blank" rel="noreferrer" icon={<ExternalLink className="icon icon-sm" aria-hidden="true" />}>
                  {t("world.connect.connect.open")}
                  <span className="sr-only"> ({t("world.newTab")})</span>
                </Button>
              </div>
              <KeyForm busy={busy || screen === "checking"} words={words} rejected={outcome !== "sent" && outcome?.kind === "rejected"} lead={screen === "rejected" ? t("world.connect.rejected.paste") : t("world.connect.connect.paste")} onSubmit={(key) => void submit(key)} />
            </Card.Body>
            <Card.Footer>
              <Button onClick={switchToDemo}>{t("world.connect.demo")}</Button>
            </Card.Footer>
          </>
        )}
      </Card>
    </main>
  );
}

/**
 * The paste field. `type="password"` so the browser masks every character while it is in the box; the hint names its
 * last four characters and its length. The raw text lives in this component's state and is cleared the moment the
 * form submits; nothing is written to storage, the URL or the console.
 */
/** The words for the last request's answer; null before one is sent. */
function outcomeWords(outcome: ConnectOutcome | "sent" | null, t: (key: string, vars?: Record<string, string | number>) => string): string | null {
  return outcome === "sent"
    ? t("world.connect.key.sent")
    : outcome?.kind === "failed"
      ? outcome.reason
        ? t("world.connect.key.failedWhy", { reason: outcome.reason })
        : t("world.connect.key.failed")
      : outcome?.kind === "not-paired"
        ? t("world.connect.key.notPaired")
        : outcome?.kind === "rejected"
          ? outcome.reason
            ? t("world.connect.rejected.reason", { reason: outcome.reason })
            : t("world.connect.rejected.fallback")
          : null;
}

function KeyForm({ busy, words, rejected, lead, onSubmit }: { busy: boolean; words: string | null; rejected: boolean; lead: string; onSubmit: (key: string) => void }) {
  const { t } = useT();
  const [raw, setRaw] = useState("");
  const [touched, setTouched] = useState(false);
  const key = normaliseKey(raw);
  const valid = looksLikeKey(key);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!valid) {
      setTouched(true);
      return;
    }
    setRaw("");
    setTouched(false);
    onSubmit(key);
  };
  return (
    <form className="connect-form" onSubmit={submit} aria-describedby={words ? "connect-outcome" : undefined}>
      <p className="connect-sub" id="connect-paste">
        {lead}
      </p>
      <div className="connect-row">
        <Field
          className="connect-key"
          label={t("world.connect.key.label")}
          type="password"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder={t("world.connect.key.placeholder")}
          value={raw}
          disabled={busy}
          aria-describedby="connect-paste"
          onChange={(e) => {
            setRaw(e.currentTarget.value);
            setTouched(false);
          }}
          hint={raw === "" ? t("world.connect.key.hint") : valid ? t("world.connect.key.pasted", { tail: keyTail(key), length: key.length }) : undefined}
          error={raw !== "" && !valid && (touched || key.length >= 47) ? t("world.connect.key.invalid") : undefined}
        />
        <Button type="submit" variant="primary" disabled={busy || raw === ""} icon={<KeyRound className="icon icon-sm" aria-hidden="true" />}>
          {busy ? t("world.connect.key.busy") : t("world.connect.key.submit")}
        </Button>
      </div>
      {words && (
        <p className={rejected ? "connect-status connect-rejected" : "connect-status"} id="connect-outcome">
          {words}
        </p>
      )}
    </form>
  );
}

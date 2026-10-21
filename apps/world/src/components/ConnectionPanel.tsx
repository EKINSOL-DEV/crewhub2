/* The Connection panel (spec addendum "a smooth connection", part 4): the chip opens it. A sheet like Settings, listing
   what the host's health says: where crewhub-loops was found (via and target), the key's name and source, the stream's
   state, cursor, last event (relative) and reconnects, the closed buildings and where that list came from (loops' event
   log, or remembered from an earlier run), loops' version (and the one the host saw first, when loops was updated under
   it), and how the host reaches loops. It asks the host every 5 s while open.
   "Forget this key" asks in the panel itself (no browser dialog), then DELETEs the stored key and reloads: the gate
   then shows the Connect screen. Before pairing the host tells states only, and the panel says so. Never the key. */
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { forgetHostKey, probeHost, type ConnectionState, type HostHealth } from "@crewhub/loops-client";
import { useT } from "../i18n";
import { connectOutcome, loopsVersion, relativeTime } from "../state/connect";
import { connectionWord } from "./ConnectionChip";
import { Button, Card } from "./primitives";

export const PANEL_POLL_MS = 5000;

interface ConnectionPanelProps {
  state: ConnectionState;
  /** The health the page started with; the panel refreshes it. */
  initial: HostHealth | null;
  onClose: () => void;
  pollMs?: number;
}

export function ConnectionPanel({ state, initial, onClose, pollMs = PANEL_POLL_MS }: ConnectionPanelProps) {
  const { t } = useT();
  const [health, setHealth] = useState<HostHealth | null>(initial);
  const [askedAt, setAskedAt] = useState<number | null>(null);
  const [silent, setSilent] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [confirm, setConfirm] = useState(false);
  const [forgetting, setForgetting] = useState(false);
  const [forgetError, setForgetError] = useState<string | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const forgetButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let live = true;
    const ask = async () => {
      const fresh = await probeHost("", 1500);
      if (!live) return;
      setAskedAt(Date.now());
      setSilent(fresh === null);
      if (fresh !== null) setHealth(fresh);
    };
    void ask();
    const timer = setInterval(() => void ask(), pollMs);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      live = false;
      clearInterval(timer);
      clearInterval(clock);
    };
  }, [pollMs]);

  useEffect(() => {
    card.current?.querySelector<HTMLElement>("button")?.focus();
  }, []);

  const forget = async () => {
    setForgetting(true);
    setForgetError(null);
    const answer = await forgetHostKey();
    const outcome = connectOutcome(answer.status, answer.body);
    if (outcome.kind === "ok") {
      globalThis.location.reload();
      return;
    }
    setForgetting(false);
    setConfirm(false);
    setForgetError(t("world.connection.panel.forgetFailed", { reason: outcome.kind === "not-paired" ? t("world.connect.key.notPaired") : (outcome.reason ?? t("world.connect.key.failed")) }));
    forgetButton.current?.focus();
  };

  const connection = health?.connection;
  const paired = health?.paired !== false;
  const found = connection?.discovery.state === "found";
  const via = connection?.discovery.via;
  const where = `${via ? ` ${t(`world.connection.panel.via.${via}`)}` : ""}${connection?.discovery.target ? t("world.connection.panel.target", { target: connection.discovery.target }) : ""}`;
  const keyState = connection ? t(`world.connection.panel.key.${connection.key.state}`) : null;
  const keyWords = connection
    ? connection.key.name && connection.key.source
      ? t("world.connection.panel.keyFrom", { name: connection.key.name, state: keyState ?? "", source: t(`world.connect.source.${connection.key.source}`) })
      : connection.key.name
        ? t("world.connection.panel.keyNamed", { name: connection.key.name, state: keyState ?? "" })
        : (keyState ?? "")
    : health?.keyName
      ? health.keyName
      : null;
  const lastEvent = connection ? (relativeTime(connection.stream.lastEventAt, now) ?? t("world.connection.panel.never")) : null;
  const cursor = connection?.stream.cursor ?? health?.cursor;
  const stored = connection?.key.source === "stored" || (connection?.key.state === "rejected" && connection.key.source !== "env");
  const archived = connection?.archived;
  const version = loopsVersion(health);
  const archivedWords = archived
    ? t("world.connection.panel.archived.from", {
        count: archived.count === 0 ? t("world.connection.panel.archived.zero") : archived.count === 1 ? t("world.connection.panel.archived.one") : t("world.connection.panel.archived.many", { count: archived.count }),
        source: t(`world.connection.panel.archived.${archived.source}`),
      })
    : null;

  return (
    <Card ref={card} className="world-sheet connection-sheet" role="dialog" aria-labelledby="connection-title" data-connection={state}>
      <Card.Header
        title={t("world.connection.panel.title")}
        titleId="connection-title"
        action={<Button variant="ghost" size="sm" iconOnly aria-label={t("world.connection.panel.close")} icon={<X className="icon" aria-hidden="true" />} onClick={onClose} />}
      />
      <Card.Body>
        <dl className="connection-facts">
          <dt>{t("world.connection.panel.state")}</dt>
          <dd>
            <span data-connection={state}>{connectionWord(state)}</span>
            <span className="hint"> {t(`world.connection.hint.${state}`)}</span>
          </dd>
          {connection && (
            <>
              <dt>{t("world.connection.panel.loops")}</dt>
              <dd>{found ? t("world.connection.panel.found", { where }) : t("world.connection.panel.searching")}</dd>
              <dt>{t("world.connection.panel.key")}</dt>
              <dd>{keyWords}</dd>
              <dt>{t("world.connection.panel.stream")}</dt>
              <dd>{t(`world.connection.panel.stream.${connection.stream.state}`)}</dd>
              {connection.stream.reason && (
                <>
                  <dt>{t("world.connection.panel.reason")}</dt>
                  <dd>{connection.stream.reason}</dd>
                </>
              )}
              <dt>{t("world.connection.panel.cursor")}</dt>
              <dd>{cursor === undefined ? t("world.connection.panel.never") : String(cursor)}</dd>
              <dt>{t("world.connection.panel.lastEvent")}</dt>
              <dd>{lastEvent}</dd>
              <dt>{t("world.connection.panel.reconnects")}</dt>
              <dd>{String(connection.stream.reconnects)}</dd>
              {archivedWords && (
                <>
                  <dt>{t("world.connection.panel.archived")}</dt>
                  <dd>{archivedWords}</dd>
                </>
              )}
            </>
          )}
          {!connection && health && (
            <>
              <dt>{t("world.connection.panel.key")}</dt>
              <dd>{keyWords ?? t("world.connection.panel.key.none")}</dd>
              {cursor !== undefined && (
                <>
                  <dt>{t("world.connection.panel.cursor")}</dt>
                  <dd>{String(cursor)}</dd>
                </>
              )}
            </>
          )}
          {version && (
            <>
              <dt>{t("world.connection.panel.version")}</dt>
              <dd>{version.before === null ? version.version : t("world.connection.panel.version.updated", { version: version.version, before: version.before })}</dd>
            </>
          )}
          {health?.transport && (
            <>
              <dt>{t("world.connection.panel.host")}</dt>
              <dd>{t(`world.connection.panel.transport.${health.transport}`)}</dd>
            </>
          )}
        </dl>
        {health && !connection && <p className="hint connection-note">{t("world.connection.panel.older")}</p>}
        {connection && !paired && <p className="hint connection-note">{t("world.connection.panel.unpaired")}</p>}
        <p className="hint connection-note" role="status" aria-live="polite">
          {silent ? t("world.connection.panel.silent") : askedAt === null ? "" : t("world.connection.panel.updated", { ago: relativeTime(new Date(askedAt).toISOString(), now) ?? "" })}
        </p>
        {forgetError && (
          <p className="connection-error" role="alert">
            {forgetError}
          </p>
        )}
      </Card.Body>
      {connection && paired && stored && (
        <Card.Footer className="connection-footer">
          {confirm ? (
            <div className="connection-confirm" role="group" aria-labelledby="connection-forget-ask">
              <p id="connection-forget-ask">{t("world.connection.panel.forgetAsk")}</p>
              <div className="connection-confirm-row">
                <Button variant="danger" size="sm" disabled={forgetting} onClick={() => void forget()}>
                  {forgetting ? t("world.connection.panel.forgetBusy") : t("world.connection.panel.forgetYes")}
                </Button>
                <Button size="sm" disabled={forgetting} onClick={() => (setConfirm(false), forgetButton.current?.focus())}>
                  {t("world.connection.panel.forgetNo")}
                </Button>
              </div>
            </div>
          ) : (
            <Button ref={forgetButton} variant="danger" size="sm" onClick={() => setConfirm(true)}>
              {t("world.connection.panel.forget")}
            </Button>
          )}
        </Card.Footer>
      )}
    </Card>
  );
}

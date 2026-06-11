// M1's only UI: a deliberately plain panel to dogfood the engine.
// It dies in M2 — keep logic in helpers.ts (tested), keep this thin.
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { commands, type SessionEvent, type SessionMeta } from "@/ipc/bindings";
import { onEngineEvent } from "@/ipc/events";
import {
  appendToTail,
  applyPermissionEvent,
  applySessionEvent,
  removePending,
  sessionKey,
  shortId,
  type PendingPermission,
} from "./helpers";
import { McpCard } from "./McpCard";
import { SessionsTable } from "./SessionsTable";
import { SpawnForm } from "./SpawnForm";

export function DebugPanel() {
  const [sessions, setSessions] = useState<Record<string, SessionMeta>>({});
  const [tail, setTail] = useState<SessionEvent[]>([]);
  const [pending, setPending] = useState<PendingPermission[]>([]);
  const [providers, setProviders] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const tailRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    let cancelled = false;
    commands
      .listAllSessions()
      .then((res) => {
        if (cancelled || res.status !== "ok") return;
        setSessions(Object.fromEntries(res.data.map((m) => [sessionKey(m.id), m])));
      })
      .catch(() => setError("backend unavailable"));
    commands
      .providerCaps()
      .then((res) => {
        if (cancelled || res.status !== "ok") return;
        setProviders(res.data.filter((e) => e.caps.spawn).map((e) => e.provider));
      })
      .catch(() => {
        // provider list is cosmetic; spawn form falls back to claude-code
      });

    const unlisten = onEngineEvent((ev) => {
      setSessions((prev) => applySessionEvent(prev, ev));
      setPending((prev) => applyPermissionEvent(prev, ev));
      setTail((prev) => appendToTail(prev, ev));
    });
    return () => {
      cancelled = true;
      unlisten.then((f) => f()).catch(() => undefined);
    };
  }, []);

  // keep the tail scrolled to the newest line
  useEffect(() => {
    const el = tailRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [tail]);

  const respond = async (p: PendingPermission, allow: boolean) => {
    const res = await commands.respondToPermission(
      p.sessionId,
      p.request.request_id,
      allow ? { kind: "AllowOnce" } : { kind: "Deny", data: { message: null } },
    );
    if (res.status === "error") setError(res.error);
    setPending((prev) => removePending(prev, p.request.request_id));
  };

  return (
    <div data-testid="debug-panel" className="flex w-full max-w-5xl flex-col gap-4 p-4">
      {error && (
        <div className="flex items-center justify-between rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span>{error}</span>
          <Button size="xs" variant="ghost" onClick={() => setError(null)}>
            dismiss
          </Button>
        </div>
      )}

      <SpawnForm providers={providers} onError={setError} />

      <Card size="sm">
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <SessionsTable sessions={Object.values(sessions)} onError={setError} />
        </CardContent>
      </Card>

      {pending.length > 0 && (
        <Card size="sm" data-testid="pending-permissions">
          <CardHeader>
            <CardTitle>🔐 Pending permissions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {pending.map((p) => (
              <div key={p.request.request_id} className="flex items-center gap-2 rounded border p-2 text-xs">
                <span className="font-mono">{shortId(p.sessionId.id)}</span>
                <span className="font-semibold">{p.request.tool}</span>
                <code className="flex-1 truncate text-muted-foreground">{p.request.input_json}</code>
                <Button size="xs" onClick={() => void respond(p, true)}>
                  Allow once
                </Button>
                <Button size="xs" variant="destructive" onClick={() => void respond(p, false)}>
                  Deny
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card size="sm">
        <CardHeader>
          <CardTitle>Raw event tail (last 200)</CardTitle>
        </CardHeader>
        <CardContent>
          <pre
            ref={tailRef}
            data-testid="event-tail"
            className="max-h-64 overflow-y-auto rounded bg-muted/40 p-2 font-mono text-[10px] leading-4"
          >
            {tail.length === 0
              ? "waiting for engine events…"
              : tail.map((ev, i) => (
                  // index keys are fine: append-only tail, throwaway panel
                  <div key={i}>{JSON.stringify(ev)}</div>
                ))}
          </pre>
        </CardContent>
      </Card>

      <McpCard onError={setError} />
    </div>
  );
}

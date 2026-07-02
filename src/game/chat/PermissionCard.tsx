// Permission prompt as a "the robot asks you" card inside the chat window
// (M2 T4). Logic ported from panels/chat/prompts/PermissionPrompt.tsx: allow
// once / always allow (writes a permission rule first) / deny with an
// optional reason, then resolvePrompt() clears the pending request and
// leaves a receipt. Restyled for ChatWindow's chunky white/slate game look
// instead of the shadcn accent/border-border panel look.
import { useState } from "react";
import { commands, type PermissionRequest, type SessionId } from "@/ipc/bindings";
import { useBindingsStore } from "@/stores/bindings";
import { useTranscripts } from "@/stores/transcripts";

/**
 * Up to 3 "key: value" lines pulled from the tool's input JSON. Falls back
 * to the raw string (truncated to 160 chars) when it isn't a JSON object.
 */
function summarizeInput(inputJson: string): string[] {
  try {
    const parsed: unknown = JSON.parse(inputJson);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      const entries = Object.entries(parsed as Record<string, unknown>).slice(0, 3);
      if (entries.length > 0) return entries.map(([k, v]) => `${k}: ${clip(stringify(v), 80)}`);
    }
  } catch {
    // not JSON — fall through to the raw fallback below
  }
  return [clip(inputJson, 160)];
}

function stringify(v: unknown): string {
  return typeof v === "string" ? v : JSON.stringify(v);
}

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function receiptFor(action: "once" | "always" | "deny", req: PermissionRequest): string {
  if (action === "deny") return `🚫 denied ${req.tool}`;
  if (action === "always") return `✅ always allowing ${req.tool}`;
  return `✅ allowed ${req.tool}`;
}

export function PermissionCard({
  sid,
  name,
  color,
  req,
}: {
  sid: SessionId;
  name: string;
  color: string;
  req: PermissionRequest;
}) {
  const resolvePrompt = useTranscripts((s) => s.resolvePrompt);
  // Bindings are keyed by the raw session id, not the "provider:id" chat key
  // (stores/bindings.ts) — same join ChatWindows.tsx does for name/color.
  // "Always allow" only appears once a character is actually bound to this
  // session; unbound sessions have no agent_id to scope the rule to.
  const agentId = useBindingsStore((s) => s.bindings[sid.id]?.agent_id) ?? null;
  const [denying, setDenying] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const respond = async (action: "once" | "always" | "deny") => {
    setBusy(true);
    setError(null);
    try {
      if (action === "always") {
        // Rule first: if writing it fails we still leave the prompt pending.
        const rule = await commands.addPermissionRule({ agent_id: agentId, tool_pattern: req.tool });
        if (rule.status === "error") {
          setError(rule.error);
          return;
        }
      }
      const response =
        action === "deny"
          ? ({ kind: "Deny", data: { message: reason.trim() ? reason.trim() : null } } as const)
          : ({ kind: action === "always" ? "AllowAlways" : "AllowOnce" } as const);
      const res = await commands.respondToPermission(sid, req.request_id, response);
      if (res.status === "error") {
        setError(res.error);
        return;
      }
      resolvePrompt(sid, req.request_id, receiptFor(action, req));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="permission-card"
      className="rounded-2xl border-2 bg-white/95 p-3 text-sm text-slate-900 shadow"
      style={{ borderColor: color }}
    >
      <div className="font-bold">🤖 {name} asks:</div>
      <div className="mt-1 truncate font-mono font-semibold">{req.tool}</div>
      <div className="mt-1 space-y-0.5 font-mono text-xs text-slate-600">
        {summarizeInput(req.input_json).map((line, i) => (
          <div key={i} className="truncate">
            {line}
          </div>
        ))}
      </div>
      {error && (
        <div className="mt-2 text-red-600" data-testid="permission-card-error">
          {error}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="permission-card-allow-once"
          disabled={busy}
          className="rounded-full px-3 py-1 font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: color }}
          onClick={() => void respond("once")}
        >
          Allow once
        </button>
        {agentId && (
          <button
            type="button"
            data-testid="permission-card-allow-always"
            disabled={busy}
            className="rounded-full border-2 border-slate-900/10 px-3 py-1 hover:bg-slate-900/5 disabled:opacity-50"
            title={`adds a rule: always allow ${req.tool}`}
            onClick={() => void respond("always")}
          >
            Always allow
          </button>
        )}
        {!denying ? (
          <button
            type="button"
            data-testid="permission-card-deny"
            disabled={busy}
            className="rounded-full border-2 border-slate-900/10 px-3 py-1 text-red-600 hover:bg-red-50 disabled:opacity-50"
            onClick={() => setDenying(true)}
          >
            Deny…
          </button>
        ) : (
          <span className="flex flex-1 items-center gap-1">
            <input
              data-testid="permission-card-deny-reason"
              className="min-w-24 flex-1 rounded-full border-2 border-slate-900/10 px-2 py-1 text-xs outline-none"
              placeholder="why? (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <button
              type="button"
              data-testid="permission-card-deny-confirm"
              disabled={busy}
              className="rounded-full border-2 border-slate-900/10 px-3 py-1 text-red-600 hover:bg-red-50 disabled:opacity-50"
              onClick={() => void respond("deny")}
            >
              Deny
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

// Inline permission card (EKI-58): allow once / always allow (writes a rule
// via add_permission_rule, then responds) / deny with optional reason.
import { useState } from "react";
import { commands, type PermissionRequest, type SessionId } from "@/ipc/bindings";
import { useTranscripts } from "@/stores/transcripts";
import { clampLines, prettyJson, toolChip, toolSummary } from "../items/tool-meta";

const INPUT_FOLD_LINES = 20;

/** One-line receipt for an answered permission ("✅ allowed Edit on src/foo.rs"). */
export function permissionReceipt(action: "once" | "always" | "deny", req: PermissionRequest): string {
  const target = toolSummary(req.input_json);
  const suffix = target ? ` on ${target}` : "";
  if (action === "deny") return `🚫 denied ${req.tool}${suffix}`;
  if (action === "always") return `✅ always allowing ${req.tool}${suffix}`;
  return `✅ allowed ${req.tool}${suffix}`;
}

export function PermissionPrompt({ sid, request }: { sid: SessionId; request: PermissionRequest }) {
  const resolvePrompt = useTranscripts((s) => s.resolvePrompt);
  const [denying, setDenying] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const pretty = prettyJson(request.input_json);
  const clamp = clampLines(pretty, INPUT_FOLD_LINES);

  const respond = async (action: "once" | "always" | "deny") => {
    setBusy(true);
    setError(null);
    try {
      if (action === "always") {
        // Rule first: if writing it fails we still leave the prompt pending.
        const rule = await commands.addPermissionRule({ agent_id: null, tool_pattern: request.tool });
        if (rule.status === "error") {
          setError(rule.error);
          return;
        }
      }
      const response =
        action === "deny"
          ? ({ kind: "Deny", data: { message: reason.trim() ? reason.trim() : null } } as const)
          : ({ kind: action === "always" ? "AllowAlways" : "AllowOnce" } as const);
      const res = await commands.respondToPermission(sid, request.request_id, response);
      if (res.status === "error") {
        setError(res.error);
        return;
      }
      resolvePrompt(sid, request.request_id, permissionReceipt(action, request));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="permission-prompt"
      className="mx-3 my-1.5 rounded-lg border border-border border-l-4 border-l-accent bg-card/80 p-3 text-xs"
    >
      <div className="flex items-center gap-2 font-medium">
        <span aria-hidden="true">🙋</span>
        <span>
          may I use {toolChip(request.tool)} <span className="font-mono">{request.tool}</span>?
        </span>
      </div>
      <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded bg-background/60 p-2 font-mono">
        {expanded ? pretty : clamp.text}
      </pre>
      {clamp.clamped && (
        <button
          type="button"
          data-testid="permission-expand"
          className="mt-1 text-accent hover:underline"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "fold" : "show all"}
        </button>
      )}
      {error && (
        <div className="mt-2 text-destructive" data-testid="permission-error">
          {error}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="permission-allow-once"
          disabled={busy}
          className="rounded-md border border-border bg-accent/20 px-2.5 py-1 font-medium hover:bg-accent/30 disabled:opacity-50"
          onClick={() => void respond("once")}
        >
          Allow once
        </button>
        <button
          type="button"
          data-testid="permission-allow-always"
          disabled={busy}
          className="rounded-md border border-border px-2.5 py-1 hover:bg-accent/20 disabled:opacity-50"
          title={`adds a rule: always allow ${request.tool}`}
          onClick={() => void respond("always")}
        >
          Always allow
        </button>
        {!denying ? (
          <button
            type="button"
            data-testid="permission-deny"
            disabled={busy}
            className="rounded-md border border-border px-2.5 py-1 text-destructive hover:bg-destructive/10 disabled:opacity-50"
            onClick={() => setDenying(true)}
          >
            Deny…
          </button>
        ) : (
          <span className="flex flex-1 items-center gap-1">
            <input
              data-testid="permission-deny-reason"
              className="min-w-40 flex-1 rounded border border-border bg-background px-2 py-1"
              placeholder="why? (optional — the agent reads this)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <button
              type="button"
              data-testid="permission-deny-confirm"
              disabled={busy}
              className="rounded-md border border-border px-2.5 py-1 text-destructive hover:bg-destructive/10 disabled:opacity-50"
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

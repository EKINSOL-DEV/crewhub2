// Pending prompts + answered receipts, docked above the composer (EKI-58).
import type { SessionId } from "@/ipc/bindings";
import { sessionKey, useTranscripts } from "@/stores/transcripts";
import { PermissionPrompt } from "./PermissionPrompt";
import { PlanApproval } from "./PlanApproval";
import { QuestionPrompt } from "./QuestionPrompt";

const RECEIPTS_SHOWN = 3;

export function PromptsArea({ sid }: { sid: SessionId }) {
  const t = useTranscripts((s) => s.sessions[sessionKey(sid)]);
  if (!t) return null;
  const receipts = t.receipts.slice(-RECEIPTS_SHOWN);
  if (t.pendingPermissions.length === 0 && t.pendingQuestions.length === 0 && receipts.length === 0) {
    return null;
  }
  return (
    <div data-testid="prompts-area">
      {receipts.map((r) => (
        <div
          key={r.request_id}
          data-testid="prompt-receipt"
          className="truncate px-4 py-0.5 text-[11px] text-muted-foreground"
        >
          {r.text}
        </div>
      ))}
      {t.pendingPermissions.map((req) => (
        <PermissionPrompt key={req.request_id} sid={sid} request={req} />
      ))}
      {t.pendingQuestions.map((q) =>
        q.kind === "plan" ? (
          <PlanApproval key={q.request_id} sid={sid} question={q} />
        ) : (
          <QuestionPrompt key={q.request_id} sid={sid} question={q} />
        ),
      )}
    </div>
  );
}

export { PermissionPrompt, PlanApproval, QuestionPrompt };

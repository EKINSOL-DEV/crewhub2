// Plan approval (EKI-58): `kind == "plan"` renders the plan markdown
// full-width with Approve / Request changes (deny with message).
// Engine contract (claude/process.rs): answers[0] == "approve" allows
// ExitPlanMode; anything else denies with the joined answers as feedback.
import { useState } from "react";
import { Markdown } from "@/components/Markdown";
import { commands, type QuestionRequest, type SessionId } from "@/ipc/bindings";
import { useTranscripts } from "@/stores/transcripts";

export function PlanApproval({ sid, question }: { sid: SessionId; question: QuestionRequest }) {
  const resolvePrompt = useTranscripts((s) => s.resolvePrompt);
  const [requesting, setRequesting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const answer = async (answers: string[], receipt: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await commands.answerQuestion(sid, { request_id: question.request_id, answers });
      if (res.status === "error") {
        setError(res.error);
        return;
      }
      resolvePrompt(sid, question.request_id, receipt);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="plan-approval"
      className="mx-3 my-1.5 rounded-lg border border-border border-l-4 border-l-accent bg-card/80 p-3 text-xs"
    >
      <div className="flex items-center gap-2 font-medium">
        <span aria-hidden="true">📋</span> the agent has a plan
      </div>
      <div className="mt-2 max-h-96 overflow-auto rounded bg-background/60 p-2">
        <Markdown text={question.text} />
      </div>
      {error && (
        <div className="mt-2 text-destructive" data-testid="plan-error">
          {error}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="plan-approve"
          disabled={busy}
          className="rounded-md border border-border bg-accent/20 px-2.5 py-1 font-medium hover:bg-accent/30 disabled:opacity-50"
          onClick={() => void answer(["approve"], "✅ plan approved")}
        >
          Approve
        </button>
        {!requesting ? (
          <button
            type="button"
            data-testid="plan-request-changes"
            disabled={busy}
            className="rounded-md border border-border px-2.5 py-1 hover:bg-accent/20 disabled:opacity-50"
            onClick={() => setRequesting(true)}
          >
            Request changes…
          </button>
        ) : (
          <span className="flex flex-1 items-center gap-1">
            <input
              data-testid="plan-feedback"
              className="min-w-40 flex-1 rounded border border-border bg-background px-2 py-1"
              placeholder="what should change?"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
            <button
              type="button"
              data-testid="plan-feedback-send"
              disabled={busy}
              className="rounded-md border border-border px-2.5 py-1 hover:bg-accent/20 disabled:opacity-50"
              onClick={() =>
                void answer([feedback.trim() ? feedback.trim() : "reject"], "✏️ requested plan changes")
              }
            >
              Send
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

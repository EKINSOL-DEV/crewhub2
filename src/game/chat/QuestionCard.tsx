// Question/plan prompt as a "the robot asks you" card inside the chat window
// (M2 T4). Logic ported from panels/chat/prompts/QuestionPrompt.tsx:
// single-select buttons, multi-select toggle chips + confirm, then
// resolvePrompt() clears the pending request and leaves a receipt. Restyled
// for ChatWindow's chunky white/slate game look. `kind === "plan"` (vs.
// "question") only swaps the header verb — same answer flow either way.
import { useState } from "react";
import { commands, type QuestionRequest, type SessionId } from "@/ipc/bindings";
import { useTranscripts } from "@/stores/transcripts";

export function QuestionCard({
  sid,
  name,
  color,
  req,
}: {
  sid: SessionId;
  name: string;
  color: string;
  req: QuestionRequest;
}) {
  const resolvePrompt = useTranscripts((s) => s.resolvePrompt);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const answer = async (answers: string[]) => {
    if (answers.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await commands.answerQuestion(sid, { request_id: req.request_id, answers });
      if (res.status === "error") {
        setError(res.error);
        return;
      }
      resolvePrompt(sid, req.request_id, `✅ answered: ${answers.join(", ")}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="question-card"
      className="rounded-2xl border-2 bg-white/95 p-3 text-sm text-slate-900 shadow"
      style={{ borderColor: color }}
    >
      <div className="font-bold">
        🤖 {name} {req.kind === "plan" ? "proposes a plan:" : "asks:"}
      </div>
      <div className="mt-1 whitespace-pre-wrap">{req.text}</div>
      {error && (
        <div className="mt-2 text-red-600" data-testid="question-card-error">
          {error}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {req.multi_select ? (
          <>
            {req.options.map((opt) => {
              const on = picked.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  data-testid={`question-card-chip-${opt}`}
                  disabled={busy}
                  aria-pressed={on}
                  className={`rounded-full border-2 px-3 py-1 disabled:opacity-50 ${
                    on ? "text-white" : "border-slate-900/10 hover:bg-slate-900/5"
                  }`}
                  style={on ? { backgroundColor: color, borderColor: color } : undefined}
                  onClick={() => setPicked((p) => (on ? p.filter((x) => x !== opt) : [...p, opt]))}
                >
                  {opt}
                </button>
              );
            })}
            <button
              type="button"
              data-testid="question-card-confirm"
              disabled={busy || picked.length === 0}
              className="rounded-full px-3 py-1 font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: color }}
              onClick={() => void answer(picked)}
            >
              Confirm
            </button>
          </>
        ) : (
          req.options.map((opt) => (
            <button
              key={opt}
              type="button"
              data-testid={`question-card-option-${opt}`}
              disabled={busy}
              className="rounded-full border-2 border-slate-900/10 px-3 py-1 hover:bg-slate-900/5 disabled:opacity-50"
              onClick={() => void answer([opt])}
            >
              {opt}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

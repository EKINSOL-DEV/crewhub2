// Question card (EKI-58): options as buttons; multi-select → checkboxes +
// confirm. Answered via answer_question (engine relays the choice).
import { useState } from "react";
import { commands, type QuestionRequest, type SessionId } from "@/ipc/bindings";
import { useTranscripts } from "@/stores/transcripts";

export function QuestionPrompt({ sid, question }: { sid: SessionId; question: QuestionRequest }) {
  const resolvePrompt = useTranscripts((s) => s.resolvePrompt);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const answer = async (answers: string[]) => {
    if (answers.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await commands.answerQuestion(sid, { request_id: question.request_id, answers });
      if (res.status === "error") {
        setError(res.error);
        return;
      }
      resolvePrompt(sid, question.request_id, `✅ answered: ${answers.join(", ")}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="question-prompt"
      className="mx-3 my-1.5 rounded-lg border border-border border-l-4 border-l-accent bg-card/80 p-3 text-xs"
    >
      <div className="flex items-start gap-2">
        <span aria-hidden="true">❓</span>
        <div className="whitespace-pre-wrap font-medium">{question.text}</div>
      </div>
      {error && (
        <div className="mt-2 text-destructive" data-testid="question-error">
          {error}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {question.multi_select ? (
          <>
            {question.options.map((opt) => (
              <label
                key={opt}
                className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 py-1 hover:bg-accent/10"
              >
                <input
                  type="checkbox"
                  data-testid={`question-check-${opt}`}
                  checked={picked.includes(opt)}
                  onChange={(e) =>
                    setPicked((p) => (e.target.checked ? [...p, opt] : p.filter((x) => x !== opt)))
                  }
                />
                {opt}
              </label>
            ))}
            <button
              type="button"
              data-testid="question-confirm"
              disabled={busy || picked.length === 0}
              className="rounded-md border border-border bg-accent/20 px-2.5 py-1 font-medium hover:bg-accent/30 disabled:opacity-50"
              onClick={() => void answer(picked)}
            >
              Answer
            </button>
          </>
        ) : (
          question.options.map((opt) => (
            <button
              key={opt}
              type="button"
              data-testid={`question-option-${opt}`}
              disabled={busy}
              className="rounded-md border border-border px-2.5 py-1 hover:bg-accent/20 disabled:opacity-50"
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

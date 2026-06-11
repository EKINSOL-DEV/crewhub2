// ToastCenter (T14, EKI-99 / D-M3-8 "Toast Critters"): stacked bottom-right,
// auto-dismiss after 6 s, hover pins, click focuses the board panel at the
// task. Blocked toasts shake gently — static under prefers-reduced-motion.
// Lane E owns this file in M3; other lanes only consume.
import "./toast.css";
import { useEffect, useRef } from "react";
import { openChatPanel } from "@/app/open-chat";
import { focusBoardAtTask, useToasts, type Toast } from "@/stores/toasts";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "./use-reduced-motion";

const AUTO_DISMISS_MS = 6_000;

function ToastCard({ toast }: { toast: Toast }) {
  const dismiss = useToasts((s) => s.dismiss);
  const reduced = usePrefersReducedMotion();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const arm = () => {
    timer.current = setTimeout(() => dismiss(toast.id), AUTO_DISMISS_MS);
  };
  const disarm = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  useEffect(() => {
    arm();
    return disarm;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.id]);

  return (
    <div
      data-testid={`toast-${toast.id}`}
      role="status"
      onMouseEnter={disarm} // hover pins
      onMouseLeave={arm}
      className={cn(
        "flex w-72 items-start gap-2 rounded-md border bg-card p-2 text-xs shadow-lg",
        toast.shake && !reduced && "ch-toast-shake",
      )}
    >
      <span aria-hidden className="text-base leading-none">
        {toast.emoji}
      </span>
      <button
        type="button"
        data-testid="toast-body"
        className="min-w-0 flex-1 cursor-pointer text-left"
        onClick={() => {
          if (toast.taskId) focusBoardAtTask(toast.taskId);
          // attention toasts (M6 T11) keep precise click-to-panel routing:
          // open the chat at the session the notification concerns.
          else if (toast.sessionKey) {
            const sep = toast.sessionKey.indexOf(":");
            openChatPanel({ provider: toast.sessionKey.slice(0, sep), id: toast.sessionKey.slice(sep + 1) });
          }
          dismiss(toast.id);
        }}
      >
        {toast.text}
      </button>
      {toast.action && (
        <button
          type="button"
          data-testid="toast-action"
          className="shrink-0 rounded border px-1.5 py-0.5 font-medium hover:bg-muted"
          onClick={toast.action.run}
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss notification"
        className="shrink-0 rounded px-1 text-muted-foreground hover:bg-muted"
        onClick={() => dismiss(toast.id)}
      >
        ✕
      </button>
    </div>
  );
}

export function ToastCenter() {
  const toasts = useToasts((s) => s.toasts);

  useEffect(() => {
    void useToasts.getState().init();
  }, []);

  if (toasts.length === 0) return null;
  return (
    <div
      data-testid="toast-center"
      aria-live="polite"
      className="absolute bottom-3 right-3 z-50 flex flex-col gap-2"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </div>
  );
}

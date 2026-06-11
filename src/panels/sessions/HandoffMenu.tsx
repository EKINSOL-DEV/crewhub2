// Handoff actions (T24, EKI-80, D-M2-8): open the session's project in an
// external tool via the Rust-side `handoff` command (the webview gets no
// shell), plus clipboard copies via the clipboard-manager plugin.
import { useState } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Button } from "@/components/ui/button";
import { commands, type HandoffTarget } from "@/ipc/bindings";

export const HANDOFF_LABELS: Record<HandoffTarget, string> = {
  Terminal: "Open in Terminal",
  Iterm: "Open in iTerm",
  Warp: "Open in Warp",
  Vscode: "Open in VS Code",
  RevealInFinder: "Reveal in Finder",
};

export function HandoffMenu({
  projectPath,
  sessionId,
}: {
  projectPath: string;
  /** null = project-level handoff (no session to resume) — M3 project cards. */
  sessionId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<HandoffTarget[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    setNote(null);
    if (next && targets === null) {
      const res = await commands.handoffTargets();
      setTargets(res.status === "ok" && Array.isArray(res.data) ? res.data : []);
    }
  };

  const handoff = async (target: HandoffTarget) => {
    const res = await commands.handoff(projectPath, target);
    setNote(res.status === "ok" ? null : res.error);
    if (res.status === "ok") setOpen(false);
  };

  const copy = async (text: string, what: string) => {
    try {
      await writeText(text);
      setNote(`${what} copied ✓`);
    } catch (e) {
      setNote(String(e));
    }
  };

  return (
    <span className="relative inline-flex">
      <Button size="xs" variant="ghost" title="Hand off to another tool" onClick={() => void toggle()}>
        ↗
      </Button>
      {open && (
        <div
          data-testid="handoff-menu"
          className="absolute top-6 right-0 z-20 flex w-52 flex-col gap-0.5 rounded border bg-card p-1 text-xs shadow"
        >
          {(targets ?? []).map((t) => (
            <button
              key={t}
              type="button"
              className="rounded px-2 py-1 text-left hover:bg-accent/10"
              onClick={() => void handoff(t)}
            >
              {HANDOFF_LABELS[t]}
            </button>
          ))}
          <button
            type="button"
            className="rounded px-2 py-1 text-left hover:bg-accent/10"
            onClick={() => void copy(projectPath, "path")}
          >
            Copy path
          </button>
          {sessionId !== null && (
            <button
              type="button"
              className="rounded px-2 py-1 text-left hover:bg-accent/10"
              onClick={() => void copy(`claude --resume ${sessionId}`, "resume command")}
            >
              Copy `claude --resume`
            </button>
          )}
          {note && <p className="px-2 py-1 text-muted-foreground">{note}</p>}
        </div>
      )}
    </span>
  );
}

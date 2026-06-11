// Composer (EKI-52): Enter sends / Shift+Enter newline, autosize, queue
// affordance while Working (input IS deliverable mid-run per M1 — the queue
// chip is purely UI until the matching UserText streams back), slash-command
// hints from list_slash_commands, interrupt.
import { useEffect, useRef, useState } from "react";
import { commands, type SessionId, type SlashCommand } from "@/ipc/bindings";
import { InsertTemplateButton } from "@/panels/automation/TemplatePicker";
import { sessionKey, useTranscripts } from "@/stores/transcripts";
import { fuzzyFilter } from "./fuzzy";
import { useSessionsStore } from "@/stores/sessions";

interface QueuedSend {
  id: number;
  text: string;
  /** Only UserText items after this seq can clear the chip. */
  sinceSeq: number;
}

const slashCache = new Map<string, SlashCommand[]>();
let nextQueueId = 1;

async function fetchSlashCommands(projectPath: string): Promise<SlashCommand[]> {
  const cached = slashCache.get(projectPath);
  if (cached) return cached;
  try {
    const res = await commands.listSlashCommands(projectPath);
    const list = res.status === "ok" ? res.data : [];
    slashCache.set(projectPath, list);
    return list;
  } catch {
    return [];
  }
}

/** The `/token` under the caret at position 0, or null. */
export function slashToken(value: string): string | null {
  const m = /^\/(\S*)$/.exec(value.split("\n")[0] ?? "");
  return value.startsWith("/") && !value.includes("\n") && m ? (m[1] ?? "") : null;
}

export function Composer({ sid }: { sid: SessionId }) {
  const key = sessionKey(sid);
  const meta = useSessionsStore((s) => s.sessions[key]);
  const transcript = useTranscripts((s) => s.sessions[key]);
  const [value, setValue] = useState("");
  const [queued, setQueued] = useState<QueuedSend[]>([]);
  const [slash, setSlash] = useState<{ project: string; list: SlashCommand[] } | null>(null);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const working = meta?.status === "Working";
  const projectPath = meta?.project_path;
  const token = slashToken(value);

  // Slash hints: fetch once per project when a "/" token appears; popover
  // visibility itself is derived from `token` during render.
  useEffect(() => {
    if (token === null || !projectPath || slash?.project === projectPath) return;
    let live = true;
    void fetchSlashCommands(projectPath).then((list) => {
      if (live) setSlash({ project: projectPath, list });
    });
    return () => {
      live = false;
    };
  }, [token, projectPath, slash]);

  // Queue chips clear when the matching UserText item streams back — derived
  // during render (the chip is purely a UI affordance, D-M2-3 keeps seq truth).
  const visibleQueued = transcript
    ? queued.filter((q) => {
        for (let i = transcript.order.length - 1; i >= 0; i--) {
          const seq = transcript.order[i] as number;
          if (seq < q.sinceSeq) break;
          const item = transcript.items.get(seq);
          if (item?.kind === "UserText" && item.data.text === q.text) return false;
        }
        return true;
      })
    : queued;

  const autosize = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  };

  const send = async () => {
    const text = value.trim();
    if (!text) return;
    setValue("");
    const lastSeq = transcript?.order[transcript.order.length - 1] ?? -1;
    if (working) {
      // prune already-confirmed chips while we're here (state stays bounded)
      setQueued([...visibleQueued, { id: nextQueueId++, text, sinceSeq: lastSeq + 1 }]);
    }
    try {
      await commands.sendToSession(sid, text);
    } catch {
      // restore the draft so nothing is lost
      setValue(text);
      setQueued((q) => q.filter((e) => e.text !== text));
    }
  };

  const matches =
    slash && token !== null && !slashDismissed && slash.project === projectPath
      ? fuzzyFilter(token, slash.list, (c) => c.name).slice(0, 8)
      : [];

  const insertSlash = (name: string) => {
    setValue(`/${name} `);
    taRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (matches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIndex((i) => (i + 1) % matches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIndex((i) => (i - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        const pick = matches[Math.min(slashIndex, matches.length - 1)];
        if (pick) insertSlash(pick.name);
        return;
      }
      if (e.key === "Escape") {
        setSlashDismissed(true);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="relative border-t border-border" data-testid="composer">
      {matches.length > 0 && (
        <div
          data-testid="slash-popover"
          className="absolute bottom-full left-3 mb-1 w-80 overflow-hidden rounded-md border border-border bg-card text-xs shadow-md"
        >
          {matches.map((c, i) => (
            <button
              key={c.name}
              type="button"
              data-testid={`slash-option-${c.name}`}
              className={`flex w-full items-baseline gap-2 px-2 py-1 text-left ${i === slashIndex ? "bg-accent/20" : ""}`}
              onClick={() => insertSlash(c.name)}
            >
              <span className="font-mono">/{c.name}</span>
              {c.description && <span className="truncate text-muted-foreground">{c.description}</span>}
            </button>
          ))}
          <div className="border-t border-border px-2 py-0.5 text-[10px] text-muted-foreground">
            Tab to insert · Esc to dismiss
          </div>
        </div>
      )}
      {visibleQueued.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 pt-1.5">
          {visibleQueued.map((q) => (
            <span
              key={q.id}
              data-testid="queued-chip"
              className="max-w-64 truncate rounded-full border border-border bg-card px-2 py-0.5 text-[10px] text-muted-foreground"
              title={q.text}
            >
              queued ⏳ {q.text}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2 p-3">
        {/* T15 (EKI-39): the one coordinated chat-panel mount — template/skill insert */}
        <InsertTemplateButton
          projectPath={projectPath ?? null}
          onInsert={(text) => {
            setValue((v) => v + text);
            taRef.current?.focus();
          }}
        />
        <textarea
          ref={taRef}
          data-testid="composer-input"
          rows={1}
          placeholder={working ? "the agent is working — messages queue up" : "Message… ( / for commands)"}
          className="max-h-50 flex-1 resize-none rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-accent"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSlashIndex(0);
            setSlashDismissed(false);
            autosize();
          }}
          onKeyDown={onKeyDown}
        />
        {working && (
          <button
            type="button"
            data-testid="composer-interrupt"
            title="interrupt the agent"
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent/20"
            onClick={() => void commands.interruptSession(sid).catch(() => {})}
          >
            ⏹
          </button>
        )}
        <button
          type="button"
          data-testid="composer-send"
          disabled={!value.trim()}
          className="rounded-md border border-border bg-accent/20 px-3 py-2 text-sm font-medium hover:bg-accent/30 disabled:opacity-50"
          onClick={() => void send()}
        >
          {working ? "queue ⏳" : "send"}
        </button>
      </div>
    </div>
  );
}

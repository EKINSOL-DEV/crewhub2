import { useState } from "react";
import { Button } from "@/components/ui/button";
import { commands, type SessionId, type SessionMeta } from "@/ipc/bindings";
import { sessionKey, shortId, statusEmoji } from "./helpers";

export function SessionsTable({
  sessions,
  onError,
}: {
  sessions: SessionMeta[];
  onError: (msg: string) => void;
}) {
  const [sendTarget, setSendTarget] = useState<SessionId | null>(null);
  const [sendText, setSendText] = useState("");

  const run = async (action: Promise<{ status: string } & object>) => {
    const res = (await action) as { status: "ok" } | { status: "error"; error: string };
    if (res.status === "error") onError(res.error);
  };

  const send = async () => {
    if (!sendTarget || !sendText.trim()) return;
    await run(commands.sendToSession(sendTarget, sendText));
    setSendText("");
    setSendTarget(null);
  };

  const sorted = [...sessions].sort((a, b) => b.last_activity_ms - a.last_activity_ms);

  return (
    <div className="flex flex-col gap-2">
      <table data-testid="sessions-table" className="w-full border-collapse text-left text-xs">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="px-2 py-1">status</th>
            <th className="px-2 py-1">provider</th>
            <th className="px-2 py-1">id</th>
            <th className="px-2 py-1">origin</th>
            <th className="px-2 py-1">activity</th>
            <th className="px-2 py-1">tokens in/out</th>
            <th className="px-2 py-1">parent</th>
            <th className="px-2 py-1">actions</th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={8} className="px-2 py-3 text-muted-foreground">
                no sessions yet — spawn one above or start one in a terminal
              </td>
            </tr>
          )}
          {sorted.map((s) => (
            <tr key={sessionKey(s.id)} className="border-b align-middle">
              <td className="px-2 py-1 whitespace-nowrap">
                {statusEmoji(s.status)} {s.status}
              </td>
              <td className="px-2 py-1">{s.id.provider}</td>
              <td className="px-2 py-1 font-mono" title={s.id.id}>
                {shortId(s.id.id)}
              </td>
              <td className="px-2 py-1">{s.origin}</td>
              <td className="max-w-48 truncate px-2 py-1" title={s.activity_detail ?? ""}>
                {s.activity_detail ?? "—"}
              </td>
              <td className="px-2 py-1 font-mono">
                {s.usage.input_tokens}/{s.usage.output_tokens}
              </td>
              <td className="px-2 py-1 font-mono">{s.parent ? shortId(s.parent.id) : "—"}</td>
              <td className="flex gap-1 px-2 py-1">
                <Button size="xs" variant="outline" onClick={() => setSendTarget(s.id)}>
                  Send
                </Button>
                <Button size="xs" variant="outline" onClick={() => void run(commands.interruptSession(s.id))}>
                  Interrupt
                </Button>
                <Button size="xs" variant="destructive" onClick={() => void run(commands.killSession(s.id))}>
                  Kill
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {sendTarget && (
        <div className="flex items-center gap-2 rounded border p-2">
          <span className="font-mono text-xs">send → {shortId(sendTarget.id)}</span>
          <input
            data-testid="send-text"
            autoFocus
            className="flex-1 rounded border bg-card px-2 py-1 text-sm"
            placeholder="message for the session"
            value={sendText}
            onChange={(e) => setSendText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void send();
            }}
          />
          <Button size="sm" onClick={() => void send()}>
            Send
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSendTarget(null)}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

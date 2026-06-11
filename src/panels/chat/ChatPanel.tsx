// The chat panel (Epic 11): seq-stitched transcript, composer, prompts,
// history mode. `params.sessionId` = "provider:id"; `params.mode = "history"`
// renders read-only (EKI-60).
import { useEffect, useMemo } from "react";
import { EmptyState } from "@/components/EmptyState";
import { parseSessionKey, sessionKey, startTranscriptStream, useTranscripts } from "@/stores/transcripts";
import { ChatContext, type ChatContextValue } from "./context";
import { MetaStrip } from "./MetaStrip";
import type { PanelProps } from "./panel-contract";
import { buildSubagentGroups } from "./subagents";
import { TypingBot } from "./TypingBot";
import { startSessionMetaStream, useAllMetas, useSessionMeta } from "./useSessionMeta";
import { VirtualTranscript } from "./VirtualTranscript";

export function ChatPanel({ params, setParams }: PanelProps) {
  useEffect(() => {
    startTranscriptStream();
    startSessionMetaStream();
  }, []);

  const skey = params.sessionId;
  if (!skey) {
    // Unbound chat: spawn-from-chat lands with the composer task (EKI-52).
    return <EmptyState emoji="💤" title="Nobody's talking yet" hint="Summon a crew member" />;
  }
  return <BoundChat key={skey} skey={skey} params={params} setParams={setParams} />;
}

function BoundChat({
  skey,
  params,
  setParams,
}: {
  skey: string;
  params: Record<string, string>;
  setParams: (p: Record<string, string>) => void;
}) {
  void params;
  void setParams;
  const sid = useMemo(() => parseSessionKey(skey), [skey]);
  const historyMode = params.mode === "history";

  useEffect(() => {
    void useTranscripts.getState().openSession(sid);
  }, [sid]);

  const meta = useSessionMeta(skey);
  const metas = useAllMetas();
  const sessions = useTranscripts((s) => s.sessions);
  const groups = useMemo(() => buildSubagentGroups(sessionKey(sid), metas, sessions), [sid, metas, sessions]);

  const t = sessions[skey];
  const lastSeq = t && t.order.length > 0 ? t.order[t.order.length - 1] : undefined;
  const lastItem = lastSeq !== undefined ? t?.items.get(lastSeq) : undefined;
  const showTyping = !historyMode && meta?.status === "Working" && lastItem?.kind !== "AssistantText";

  const ctx = useMemo<ChatContextValue>(
    () => ({ sessionId: sid, readOnly: historyMode }),
    [sid, historyMode],
  );

  return (
    <ChatContext.Provider value={ctx}>
      <div className="flex h-full min-h-0 flex-col" data-testid="chat-panel">
        <MetaStrip sid={sid} historyMode={historyMode} />
        <div className="min-h-0 flex-1">
          <VirtualTranscript sid={sid} groups={groups} />
        </div>
        {showTyping && <TypingBot />}
      </div>
    </ChatContext.Provider>
  );
}

export default ChatPanel;

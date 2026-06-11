// The chat panel (Epic 11): seq-stitched transcript, composer, prompts,
// history mode. `params.sessionId` = "provider:id"; `params.mode = "history"`
// renders read-only (EKI-60).
import { useEffect, useMemo, useState } from "react";
import { openChatPanel } from "@/app/open-chat";
import { commands } from "@/ipc/bindings";
import type { PanelProps } from "@/panels/registry";
import { useAgentsStore } from "@/stores/agents";
import { useBindingsStore } from "@/stores/bindings";
import { useSessionsStore } from "@/stores/sessions";
import { parseSessionKey, sessionKey, startTranscriptStream, useTranscripts } from "@/stores/transcripts";
import { Composer } from "./Composer";
import { ChatContext, type ChatContextValue } from "./context";
import { HistoryFooter } from "./HistoryFooter";
import { MetaStrip } from "./MetaStrip";
import { PromptsArea } from "./prompts";
import { SpawnFromChat } from "./SpawnFromChat";
import { buildSubagentGroups } from "./subagents";
import { TypingBot } from "./TypingBot";
import { VirtualTranscript } from "./VirtualTranscript";

export function ChatPanel({ params, setParams }: PanelProps) {
  useEffect(() => {
    startTranscriptStream();
    // Session metadata + display names come from the shared stores (T18 join).
    void useSessionsStore.getState().init();
    void useBindingsStore.getState().init();
    void useAgentsStore.getState().init();
  }, []);

  const skey = params.sessionId;
  if (!skey) {
    // Unbound chat: summon a crew member right here (EKI-52, D-M2-7).
    return <SpawnFromChat onSpawned={(id) => setParams({ ...params, sessionId: sessionKey(id) })} />;
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
  const sid = useMemo(() => parseSessionKey(skey), [skey]);
  const historyMode = params.mode === "history";
  const [rewindError, setRewindError] = useState<string | null>(null);

  useEffect(() => {
    void useTranscripts.getState().openSession(sid);
  }, [sid]);

  const meta = useSessionsStore((s) => s.sessions[skey]);
  const metas = useSessionsStore((s) => s.sessions);
  const sessions = useTranscripts((s) => s.sessions);
  const groups = useMemo(() => buildSubagentGroups(sessionKey(sid), metas, sessions), [sid, metas, sessions]);

  const t = sessions[skey];
  const lastSeq = t && t.order.length > 0 ? t.order[t.order.length - 1] : undefined;
  const lastItem = lastSeq !== undefined ? t?.items.get(lastSeq) : undefined;
  const showTyping = !historyMode && meta?.status === "Working" && lastItem?.kind !== "AssistantText";

  // Rewind = fork-from-checkpoint (EKI-64): the new session resumes this one
  // as a fork and opens in a NEW panel via the workspace store — the original
  // stays untouched and visible. Annotated in the new panel's params.
  const projectPath = meta?.project_path ?? params.projectPath;
  const ctx = useMemo<ChatContextValue>(() => {
    const base: ChatContextValue = { sessionId: sid, readOnly: historyMode };
    if (!projectPath) return base; // no path → no rewind affordance, no residue
    return {
      ...base,
      rewindTo: (checkpointId: string) => {
        void (async () => {
          try {
            const res = await commands.spawnSession(sid.provider, {
              project_path: projectPath,
              prompt: null,
              model: null,
              permission_mode: "Default",
              resume_session: sid.id,
              fork: true,
              append_system_prompt: null,
              agent_id: null,
            });
            if (res.status === "ok") {
              openChatPanel({
                provider: res.data.provider,
                id: res.data.id,
                note: `⏪ rewind @ ${checkpointId}`,
              });
            } else {
              setRewindError(res.error);
            }
          } catch (e) {
            setRewindError(String(e));
          }
        })();
      },
    };
  }, [sid, historyMode, projectPath]);

  return (
    <ChatContext.Provider value={ctx}>
      <div className="flex h-full min-h-0 flex-col" data-testid="chat-panel">
        <MetaStrip sid={sid} historyMode={historyMode} note={params.note} />
        {rewindError && (
          <div className="px-3 py-1 text-xs text-destructive" data-testid="rewind-error">
            rewind failed: {rewindError}
          </div>
        )}
        <div className="min-h-0 flex-1">
          <VirtualTranscript sid={sid} groups={groups} />
        </div>
        {!historyMode && <PromptsArea sid={sid} />}
        {showTyping && <TypingBot />}
        {historyMode ? (
          <HistoryFooter
            sid={sid}
            projectPath={params.projectPath}
            onLive={(id, kind) => {
              // Take-over swaps this panel live; forks open a NEW panel via the
              // workspace store — the original history view stays put.
              if (kind === "fork") {
                openChatPanel({ provider: id.provider, id: id.id, note: `fork of ${skey}` });
              } else {
                setParams({ sessionId: sessionKey(id) });
              }
            }}
          />
        ) : (
          <Composer sid={sid} />
        )}
      </div>
    </ChatContext.Provider>
  );
}

export default ChatPanel;

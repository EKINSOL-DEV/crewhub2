// Source: crewhub-loops apps/web/src/components/bubbles/queries.ts @ a1bed0f. Copied verbatim; do not edit here, change the source and re-copy.
import { useEffect } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, shouldRetry } from "../../api/client";
import type { AgentSummaryResponse, AgentsResponse, BubblesResponse, DmMessageRequest, DmMessageResponse, DmMessagesResponse, DmThreadsResponse, GlobalFeatureResponse } from "../../api/types";

export const dmKeys = {
  feature: ["bubbles-feature"] as const,
  pins: ["bubbles-pins"] as const,
  threads: ["dm-threads"] as const,
  messages: (agent: string) => ["dm-messages", agent] as const,
};

export function useBubblesFeature(enabled: boolean) {
  return useQuery({ queryKey: dmKeys.feature, enabled, retry: shouldRetry,
    queryFn: async () => {
      try { return (await api.get<GlobalFeatureResponse>("/api/features/global/bubbles")).feature.value === true; }
      catch (error) { if (error instanceof ApiError && error.status === 404) return false; throw error; }
    }, refetchInterval: 30_000 });
}

export function useBubblesData() {
  const qc = useQueryClient();
  useEffect(() => {
    const reconcile = () => { if (!document.hidden) void qc.invalidateQueries({ queryKey: dmKeys.threads }); };
    const interval = setInterval(reconcile, 60_000);
    window.addEventListener("focus", reconcile);
    document.addEventListener("visibilitychange", reconcile);
    return () => { clearInterval(interval); window.removeEventListener("focus", reconcile); document.removeEventListener("visibilitychange", reconcile); };
  }, [qc]);
  const pins = useQuery({ queryKey: dmKeys.pins, queryFn: () => api.get<BubblesResponse>("/api/me/bubbles"), retry: shouldRetry });
  const threads = useQuery({ queryKey: dmKeys.threads, queryFn: () => api.get<DmThreadsResponse>("/api/dm/threads"), retry: shouldRetry });
  const agents = useQuery({ queryKey: ["agents"], queryFn: () => api.get<AgentsResponse>("/api/agents"), retry: shouldRetry });
  return { pins, threads, agents };
}

export function usePins() {
  const qc = useQueryClient();
  return useMutation({ scope: { id: "bubbles-pins" },
    mutationFn: ({ agentId, pinned }: { agentId: string; pinned: boolean }) => {
      const allowed = new Set(qc.getQueryData<AgentsResponse>(["agents"])?.agents.filter((a) => a.role === "lead" && !a.disabled).map((a) => a.id));
      const current = (qc.getQueryData<BubblesResponse>(dmKeys.pins)?.pinnedAgentIds ?? []).filter((id) => allowed.has(id));
      const pinnedAgentIds = pinned ? [...new Set([...current, agentId])] : current.filter((id) => id !== agentId);
      return api.put<BubblesResponse>("/api/me/bubbles", { pinnedAgentIds });
    },
    onSuccess: (data) => qc.setQueryData(dmKeys.pins, data),
  });
}

interface ChatDraft { text: string; submittedText: string | null; clientId: string | null; pending: boolean; error: boolean }
const emptyDraft = (): ChatDraft => ({ text: "", submittedText: null, clientId: null, pending: false, error: false });

export function useChat(agent: string, person: string) {
  const path = `/api/dm/threads/${encodeURIComponent(agent)}`;
  const qc = useQueryClient();
  const messages = useInfiniteQuery({ queryKey: dmKeys.messages(agent), initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api.get<DmMessagesResponse>(`${path}/messages${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ""}`),
    getNextPageParam: (page) => page.nextCursor, retry: shouldRetry });
  const summary = useQuery({ queryKey: ["dm-summary", agent], queryFn: () => api.get<AgentSummaryResponse>(`/api/agents/${encodeURIComponent(agent)}/summary`), retry: shouldRetry });
  // Query cache is cleared on login/logout; unresolved drafts are scoped to this person and thread.
  const draftKey = ["dm-draft", person, agent];
  const draft = useQuery<ChatDraft>({ queryKey: draftKey, enabled: false, queryFn: emptyDraft, initialData: emptyDraft, gcTime: Infinity });
  const updateDraft = (patch: Partial<ChatDraft>) => qc.setQueryData<ChatDraft>(draftKey, (current) => ({ ...(current ?? emptyDraft()), ...patch }));
  const send = useMutation({ mutationFn: (body: DmMessageRequest) => api.post<DmMessageResponse>(`${path}/messages`, body),
    onError: () => updateDraft({ pending: false, error: true }),
    onSuccess: async () => {
      qc.setQueryData(draftKey, emptyDraft());
      await qc.invalidateQueries({ queryKey: dmKeys.messages(agent) });
      await qc.invalidateQueries({ queryKey: dmKeys.threads });
    } });
  const submit = () => {
    const current = qc.getQueryData<ChatDraft>(draftKey) ?? emptyDraft();
    const text = current.text.trim();
    if (!text || current.pending) return;
    const clientId = current.submittedText === text && current.clientId ? current.clientId : crypto.randomUUID();
    updateDraft({ clientId, submittedText: text, pending: true, error: false });
    send.mutate({ bodyMarkdown: text, clientId });
  };
  const read = useMutation({ scope: { id: `dm-read-${agent}` }, mutationFn: (lastReadMessageId: string) => api.put<void>(`${path}/read`, { lastReadMessageId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: dmKeys.threads }) });
  return { messages, summary, draft: draft.data, updateDraft, submit, read };
}

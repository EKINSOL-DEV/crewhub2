// History panel (T24, EKI-78): browse archived sessions grouped by date,
// search transcripts with snippet hits, open read-only in chat history mode.
import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { commands, type ArchivedSession, type SearchHit } from "@/ipc/bindings";
import { requestOpenChat } from "../sessions/openChat";
import { useNow } from "../sessions/useNow";
import { groupArchived, projectName } from "./group";

// Accepts registry PanelProps; only `params.projectFilter` is read.
// TODO(merge): take the filter from Lane A's useProjectFilter (EKI-22).
export function HistoryPanel({ params }: { params?: Record<string, string> }) {
  const projectFilter = params?.["projectFilter"] ?? null;
  const [archived, setArchived] = useState<ArchivedSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const now = useNow();

  useEffect(() => {
    let cancelled = false;
    commands
      .listArchivedSessions(projectFilter)
      .then((res) => {
        if (cancelled) return;
        if (res.status === "ok" && Array.isArray(res.data)) setArchived(res.data);
        else setArchived([]);
        if (res.status === "error") setError(res.error);
      })
      .catch((e) => {
        if (!cancelled) {
          setArchived([]);
          setError(String(e));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectFilter]);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setHits(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const res = await commands.searchTranscripts(q);
      setHits(res.status === "ok" && Array.isArray(res.data) ? res.data : []);
    } catch {
      setHits([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const onQueryChange = (q: string) => {
    setQuery(q);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void runSearch(q), 300);
  };

  const open = (provider: string, id: string) => requestOpenChat({ provider, id, mode: "history" });
  const groups = groupArchived(archived ?? [], now);

  return (
    <div data-testid="history-panel" className="flex h-full flex-col gap-2 overflow-auto p-3">
      <h2 className="text-sm font-semibold">🗄️ History</h2>

      <input
        aria-label="Search transcripts"
        className="rounded border bg-card px-2 py-1 text-sm"
        placeholder="Search past conversations…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void runSearch(query);
        }}
      />

      {error && (
        <p data-testid="history-error" className="text-xs text-red-400">
          {error}
        </p>
      )}

      {query.trim() && (
        <section data-testid="search-results" className="flex flex-col gap-0.5">
          <h3 className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            {searching ? "Searching…" : `Hits (${hits?.length ?? 0})`}
          </h3>
          {(hits ?? []).map((h, i) => (
            <button
              key={`${h.session_id.id}-${h.ts}-${i}`}
              type="button"
              className="flex items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-accent/10"
              onClick={() => open(h.session_id.provider, h.session_id.id)}
            >
              <span className="shrink-0 text-muted-foreground">{h.role}</span>
              <span className="flex-1 truncate" title={h.snippet}>
                {h.snippet}
              </span>
            </button>
          ))}
          {!searching && hits !== null && hits.length === 0 && (
            <p className="text-xs text-muted-foreground">No matches — past you said nothing of the sort.</p>
          )}
        </section>
      )}

      {archived !== null && archived.length === 0 && !query.trim() && (
        <EmptyState
          emoji="🗄️"
          title="No past lives yet"
          hint="Finished sessions are archived here — browse them read-only or search what was said."
        />
      )}

      {!query.trim() &&
        groups.map((g) => (
          <section key={g.label}>
            <h3 className="mb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              {g.label}
            </h3>
            <div className="flex flex-col gap-0.5">
              {g.sessions.map((s) => (
                <button
                  key={`${s.id.provider}:${s.id.id}`}
                  type="button"
                  data-testid={`archived-${s.id.id}`}
                  className="flex items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-accent/10"
                  title={s.project_path}
                  onClick={() => open(s.id.provider, s.id.id)}
                >
                  <span className="shrink-0 rounded bg-muted px-1 text-[10px]">
                    {projectName(s.project_path)}
                  </span>
                  <span className="flex-1 truncate">{s.summary || s.id.id}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}

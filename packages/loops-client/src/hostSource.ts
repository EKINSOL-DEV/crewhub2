/* STAND-IN (task/live): the agreed signatures of the live source (team map "Live source"), with a minimal working body so
   the world's live mode can be built and tried against a host. The hostsource developer's version replaces this file
   whole; on a merge conflict take theirs. Reads only its own host's `/world-api`. */
import type { ConnectionState, ConnectionStatus, HostSourceOptions, LoopsSnapshot, SourceMessage, WorldSource } from "./source.ts";
import type { BoardResponse, CommentOut, Envelope, MilestoneSummary, ProgressItem, ProjectGroup, ProjectOut, ReleaseSummary, Ticket, WatchdogResponse } from "./types.ts";

export interface HostHealth {
  loops: "ok" | "down" | "unauthorized";
  keyName: string;
  sharedKey: boolean;
  loopsCommit?: string;
  cursor?: number;
}

/** GET /world-api/health, or null when no host answers within `timeoutMs`. Never throws. */
export async function probeHost(baseUrl = "", timeoutMs = 1500): Promise<HostHealth | null> {
  try {
    const response = await fetch(`${baseUrl}/world-api/health`, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json" } });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || typeof (body as HostHealth).loops !== "string") return null;
    return body as HostHealth;
  } catch {
    return null;
  }
}

const STALE_MS = 40_000;

type StreamMessage =
  | { type: "status"; loops: HostHealth["loops"] }
  | { type: "event"; envelope: Envelope }
  | { type: "heartbeat"; seq: number; ts: string }
  | { type: "reset"; reason: string };

export function createHostSource(options: HostSourceOptions = {}): WorldSource {
  const base = `${options.baseUrl ?? ""}/world-api`;
  let state: ConnectionState = "connecting";
  const listeners = new Set<() => void>();
  const setState = (next: ConnectionState) => {
    if (state === next) return;
    state = next;
    for (const l of listeners) l();
  };
  const connection: ConnectionStatus = {
    state: () => state,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const read = async <T>(path: string): Promise<T | null> => {
    const response = await fetch(`${base}${path}`, { headers: { accept: "application/json" } });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    return (await response.json()) as T;
  };

  return {
    mode: "live",
    playback: null,
    connection,
    now: () => Date.now(),
    start(listener: (message: SourceMessage) => void) {
      let stopped = false;
      let cursor = 0;
      let staleTimer: ReturnType<typeof setTimeout> | undefined;
      const touch = () => {
        clearTimeout(staleTimer);
        staleTimer = setTimeout(() => !stopped && setState("stale"), STALE_MS);
      };
      const snapshot = async (): Promise<boolean> => {
        try {
          const response = await fetch(`${base}/snapshot`, { headers: { accept: "application/json" } });
          if (response.status === 503) {
            const body = (await response.json().catch(() => null)) as { error?: string } | null;
            setState(body?.error === "unauthorized" ? "unauthorized" : "loops-down");
            return false;
          }
          if (!response.ok) throw new Error(String(response.status));
          const snap = (await response.json()) as LoopsSnapshot;
          cursor = snap.cursor;
          listener({ type: "snapshot", snapshot: { ...snap, groups: snap.groups ?? [] } });
          setState("live");
          touch();
          return true;
        } catch {
          setState("stale");
          return false;
        }
      };
      const run = async () => {
        let delay = 1000;
        while (!stopped) {
          if (!(await snapshot())) {
            await new Promise((r) => setTimeout(r, delay));
            delay = Math.min(delay * 2, 15_000);
            continue;
          }
          delay = 1000;
          try {
            const response = await fetch(`${base}/stream?cursor=${cursor}`, { headers: { accept: "text/event-stream" } });
            if (!response.ok || !response.body) throw new Error(String(response.status));
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let reset = false;
            while (!stopped && !reset) {
              const { value, done } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              let at: number;
              while ((at = buffer.indexOf("\n\n")) >= 0) {
                const chunk = buffer.slice(0, at);
                buffer = buffer.slice(at + 2);
                const data = chunk
                  .split("\n")
                  .filter((line) => line.startsWith("data:"))
                  .map((line) => line.slice(5).trim())
                  .join("\n");
                if (!data) continue;
                let message: StreamMessage;
                try {
                  message = JSON.parse(data) as StreamMessage;
                } catch {
                  continue;
                }
                touch();
                if (message.type === "status") {
                  if (message.loops === "ok") setState("live");
                  else setState(message.loops === "down" ? "loops-down" : "unauthorized");
                } else if (message.type === "heartbeat") {
                  listener({ type: "heartbeat", seq: message.seq, ts: message.ts });
                } else if (message.type === "event") {
                  const seq = message.envelope.seq;
                  if (seq > cursor + 1) {
                    reset = true;
                    break;
                  }
                  cursor = seq;
                  listener({ type: "event", envelope: message.envelope });
                } else if (message.type === "reset") {
                  reset = true;
                  break;
                }
              }
            }
            await reader.cancel().catch(() => {});
            if (!stopped) setState("catching-up");
          } catch {
            if (!stopped) setState("stale");
            await new Promise((r) => setTimeout(r, delay));
            delay = Math.min(delay * 2, 15_000);
          }
        }
      };
      void run();
      return () => {
        stopped = true;
        clearTimeout(staleTimer);
      };
    },
    getTicket: (ref) => read<Ticket>(`/tickets/${encodeURIComponent(ref)}`),
    getProject: (slug) => read<ProjectOut>(`/projects/${encodeURIComponent(slug)}`),
    getBoard: (slug) => read<BoardResponse>(`/board/${encodeURIComponent(slug)}`),
    getWatchdog: async () => (await read<WatchdogResponse>("/watchdog")) ?? { mode: "off" },
    getMilestones: async (slug) => ((await read<{ milestones: MilestoneSummary[] }>(`/projects/${encodeURIComponent(slug)}/milestones`))?.milestones ?? []),
    getReleases: async (slug) => ((await read<{ releases: ReleaseSummary[] }>(`/projects/${encodeURIComponent(slug)}/releases`))?.releases ?? []),
    listProjectGroups: async () => ((await read<{ groups: ProjectGroup[] }>("/project-groups"))?.groups ?? []),
    getComments: async (ref) => ((await read<{ comments: CommentOut[] }>(`/tickets/${encodeURIComponent(ref)}/comments`))?.comments ?? []),
    getProgress: async (ref) => ((await read<{ progress: ProgressItem[] }>(`/tickets/${encodeURIComponent(ref)}/progress`))?.progress ?? []),
  };
}

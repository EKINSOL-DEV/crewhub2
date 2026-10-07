/** Reads the host's SSE stream in a test: parsed `data:` messages, with a wait for the next one that matches. */

export interface SseReader {
  messages: Record<string, unknown>[];
  /** Resolves with the first message (from `from` on) matching `test`, or rejects after `timeoutMs`. */
  next(test: (m: Record<string, unknown>) => boolean, timeoutMs?: number): Promise<Record<string, unknown>>;
  close(): void;
}

export async function openSse(url: string, headers: Record<string, string> = {}): Promise<SseReader> {
  const abort = new AbortController();
  const response = await fetch(url, { signal: abort.signal, headers });
  if (response.status !== 200 || response.body === null) throw new Error(`stream answered ${response.status}`);
  const messages: Record<string, unknown>[] = [];
  const waiters = new Set<() => void>();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  void (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        let at = pending.indexOf("\n\n");
        while (at !== -1) {
          const chunk = pending.slice(0, at);
          pending = pending.slice(at + 2);
          const data = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (data !== undefined) messages.push(JSON.parse(data.slice(6)) as Record<string, unknown>);
          at = pending.indexOf("\n\n");
        }
        for (const w of [...waiters]) w();
      }
    } catch {
      // closed
    }
  })();
  let from = 0;
  return {
    messages,
    next(test, timeoutMs = 3000) {
      return new Promise((resolve, reject) => {
        const check = () => {
          for (; from < messages.length; from += 1) {
            const m = messages[from] as Record<string, unknown>;
            if (test(m)) {
              from += 1;
              waiters.delete(check);
              clearTimeout(timer);
              resolve(m);
              return;
            }
          }
        };
        const timer = setTimeout(() => {
          waiters.delete(check);
          reject(new Error(`no matching message within ${timeoutMs} ms; got ${JSON.stringify(messages)}`));
        }, timeoutMs);
        waiters.add(check);
        check();
      });
    },
    close: () => abort.abort(),
  };
}

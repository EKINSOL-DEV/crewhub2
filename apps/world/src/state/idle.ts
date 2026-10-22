/* A task for the browser's idle time: `requestIdleCallback` with a deadline (the task runs after `timeout` ms at the
   latest, idle or not), or a plain timer where there is no idle callback (Safari). Answers the cancel. */
export function whenIdle(task: () => void, timeout = 2000): () => void {
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(() => task(), { timeout });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(task, timeout);
  return () => clearTimeout(id);
}

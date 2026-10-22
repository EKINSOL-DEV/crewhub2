/* The page's wiring of road 2 (round 28): one runner (state/pageChat.ts) for the live page, restarted when the host's
   word (its key reads the chat, the loops origin) changes; the lines go to the said store, the threads to the card's
   store, the probe's verdict to the chat road store (state/chatRoadStore, r28-session's contract: the words switch by
   themselves); the page coming back into view and the online event wake it. Kept apart from pageChat.ts, which imports
   nothing of the page, so the runner and its test load under node. */
import { createPageChatRunner, publishPageChat, type PageChatRunner } from "./pageChat.ts";
import { rememberPageProbe } from "./chatRoadStore.ts";
import { rememberSaid } from "./said.ts";
import { rememberThreads } from "./threads.ts";

let running: PageChatRunner | null = null;
let unlisten: (() => void) | null = null;

/**
 * The page's wiring: one runner for the live page, restarted when the host's word (its key reads the chat, the loops
 * origin) changes; the lines go to the said store, the threads to the threads store; visibility and the online event
 * wake it. Returns the stop.
 */
export function startPageChat(input: { loopsOrigin: string; hostKeyReadsChat: boolean | null }): () => void {
  stopPageChat();
  const runner = createPageChatRunner({
    ...input,
    hidden: () => document.hidden,
    online: () => navigator.onLine,
    onLine: (line) => rememberSaid(line),
    onThreads: (threads) => rememberThreads(threads),
    // The probe's verdict goes to the chat road store (state/chatRoadStore, r28-session): the words switch by themselves.
    onState: (state) => {
      publishPageChat(state);
      rememberPageProbe(state.probe);
    },
  });
  running = runner;
  const visible = () => {
    if (!document.hidden) runner.wake();
  };
  const online = () => runner.wake();
  document.addEventListener("visibilitychange", visible);
  window.addEventListener("online", online);
  unlisten = () => {
    document.removeEventListener("visibilitychange", visible);
    window.removeEventListener("online", online);
  };
  runner.start();
  return stopPageChat;
}

export function stopPageChat(): void {
  unlisten?.();
  unlisten = null;
  running?.stop();
  running = null;
}

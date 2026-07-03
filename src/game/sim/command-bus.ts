// Command bus (M7 T3): a bridge between the chat layer and the sim. Chat
// windows (ChatWindow.tsx, via use-chat-session.ts) live outside <Canvas> —
// GameCanvas mounts the R3F tree that owns `Sim` (see use-sim.ts), so there's
// no React prop path from a composer's Enter key down to `sim.command()`.
// Rather than thread a sim ref through GameShell/ChatWindows (the sim is
// built once per campus mount; chat windows open and close independently of
// it), chat posts commands into this tiny FIFO queue and use-sim.ts drains it
// every frame, before ticking — so a command posted this frame lands before
// that bot's next step, never a frame late. Module-level, not a store: there
// is exactly one sim per app and no component needs to react to the queue's
// contents, only drain them.
import type { SimCommand } from "./sim";

export interface QueuedCommand {
  key: string;
  cmd: SimCommand;
}

let queue: QueuedCommand[] = [];

/** Enqueue a command for `key`'s bot — consumed on the sim's next drain. */
export function postCommand(key: string, cmd: SimCommand): void {
  queue.push({ key, cmd });
}

/** FIFO: returns everything queued since the last drain and clears the queue. */
export function drainCommands(): QueuedCommand[] {
  if (queue.length === 0) return queue; // already [] — skip the alloc on the common empty case
  const drained = queue;
  queue = [];
  return drained;
}

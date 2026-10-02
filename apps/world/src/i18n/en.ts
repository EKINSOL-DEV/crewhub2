/* Source: crewhub-loops apps/web/src/i18n/en/{agents,common,dashboard,enums}.ts @ a1bed0f. Only the keys the copied chat
   (components/bubbles) and its ported helpers use, with loops' English text unchanged. Add a key here when a re-copy
   starts using one; change the text in crewhub-loops, never only here. */
export const EN: Record<string, string> = {
  // agents.ts
  "agents.chat.answered": "Answered",
  "agents.bubbles.chats": "Agent chats",
  "agents.bubbles.open": "Chat with {name}, {count} unread",
  "agents.bubbles.total": "Agent chats, {count} unread",
  "agents.bubbles.pin": "Pin an agent",
  "agents.bubbles.pinAgent": "Pin {name}",
  "agents.bubbles.unpin": "Unpin",
  "agents.bubbles.options": "Chat options",
  "agents.bubbles.settings": "Agent settings",
  "agents.bubbles.close": "Close chat",
  "agents.bubbles.summary": "Agent activity",
  "agents.bubbles.summaryError": "Summary unavailable",
  "agents.bubbles.pinError": "Could not save pins. Try again.",
  "agents.bubbles.older": "Load older messages",
  "agents.bubbles.loadError": "Could not load messages.",
  "agents.bubbles.retry": "Retry",
  "agents.bubbles.messages": "Messages",
  "agents.bubbles.message": "Message",
  "agents.bubbles.sendError": "Could not send. Retry to send the same message once.",
  "agents.bubbles.send": "Send",
  "agents.bubbles.queued": "Queued",
  "agents.bubbles.delivered": "Delivered",
  "agents.bubbles.answered": "Answered",
  // common.ts
  "common.loading": "Loading…",
  "avatar.agent": "{name} (agent)",
  // dashboard.ts
  "time.now": "now",
  "time.minutes": "{n}m",
  "time.hours": "{n}h",
  "time.days": "{n}d",
  // enums.ts
  "delivery.pending": "Pending",
  "delivery.claimed": "Claimed",
  "delivery.forwarded": "Forwarded",
  "delivery.uncertain": "Uncertain",
  "delivery.unroutable": "Unroutable",
  "delivery.obsolete": "Obsolete",
};

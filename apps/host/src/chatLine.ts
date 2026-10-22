/**
 * An agent's message to the person, as the world shows it (the chat's key road, round 12 and round 19): the host reads
 * the message by id with its own key on a crewhub-loops whose viewer key may read the chat (`world/viewer-key`) and hands
 * the tabs one `ChatLine` (the agent, the first line, when): a speech bubble over that agent's figure, a row in Recent
 * answers. What the person sent shows nothing. Nothing of a conversation is kept beyond that line.
 */
export interface ChatLine {
  agentId: string;
  agentName?: string;
  /** The first line of the message, at most `LINE_MAX` characters. */
  text: string;
  /** When the message was written (ISO). */
  at: string;
  messageId: string;
  threadId: string;
}
export const LINE_MAX = 140;

/** The first non-empty line of a message, at most LINE_MAX characters, an ellipsis after. */
export const firstLine = (text: string): string => {
  const line = text.replace(/\r/g, "").split("\n").find((l) => l.trim() !== "")?.trim() ?? "";
  return line.length > LINE_MAX ? `${line.slice(0, LINE_MAX - 1)}…` : line;
};

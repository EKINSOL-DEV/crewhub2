/* The world's stand-in for crewhub-loops' `components/ticket/TicketKeyLink.tsx` (CL-114): the copied chat (Bubbles.tsx @ c7f9d679)
   wraps a message's text in `WithTicketKeys`, which in loops turns ticket keys into links with a hover card. The world has no
   ticket pages to link to, so the text is rendered as it is, as the a1bed0f copy showed it: nothing visible changes. */
export function WithTicketKeys({ text }: { text: string }) {
  return <>{text}</>;
}

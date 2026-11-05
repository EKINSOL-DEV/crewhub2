/* Round 64 (w5-8): the copied chat dock (components/bubbles/Bubbles.tsx, crewhub-loops' own file, not edited here)
   disables its message box and its Send button while a message is sent, so a Send by keyboard (Tab to Send, Enter)
   drops the focus to the document body: the next Tab starts from nowhere. This guard listens for the dock's submit on
   the document (the chat card is portaled to the body, so no wrapper sees it), watches the form's controls for their
   `disabled` changes, and once the box is enabled again (the send done, or failed) puts the focus back in it, only
   when the focus went to the body meanwhile: a person who moved to Close keeps that. App.tsx attaches it in demo
   mode, where the dock is. */

/** The dock's compose form (loops' class). */
export const COMPOSE_FORM = "form.chat-compose";

export interface DockFocusDeps {
  /** Calls `onChange` whenever a control's `disabled` changes under `form`; answers the stop. Default: a MutationObserver. */
  observeDisabled: (form: Element, onChange: () => void) => () => void;
}

const observeWithMutationObserver: DockFocusDeps["observeDisabled"] = (form, onChange) => {
  const observer = new MutationObserver(onChange);
  observer.observe(form, { attributes: true, attributeFilter: ["disabled"], subtree: true });
  return () => observer.disconnect();
};

/** Attaches the guard to `doc`; answers the detach. */
export function attachSendFocusGuard(doc: Document, deps: Partial<DockFocusDeps> = {}): () => void {
  const observe = deps.observeDisabled ?? observeWithMutationObserver;
  let stop: (() => void) | null = null;
  const onSubmit = (event: Event) => {
    const target = event.target as { closest?: (selector: string) => Element | null } | null;
    const form = target?.closest?.(COMPOSE_FORM) ?? null;
    const field = form?.querySelector("textarea") ?? null;
    if (!form || !field) return;
    stop?.();
    stop = observe(form, () => {
      if (field.disabled) return;
      stop?.();
      stop = null;
      const active = doc.activeElement;
      if (active === null || active === doc.body) field.focus();
    });
  };
  doc.addEventListener("submit", onSubmit);
  return () => {
    doc.removeEventListener("submit", onSubmit);
    stop?.();
    stop = null;
  };
}

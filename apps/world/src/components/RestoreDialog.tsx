/* The restore preview (round 21, spec addendum "the world database, second slice"): before a town file or a backup
   replaces the town, a modal says what would change, in plain words, and asks. Restore makes it the next revision (Undo
   goes back); Cancel or Escape changes nothing; "Download the current town first" exports what stands now. The focus
   goes inside on open and stays within (Tab cycles its controls), and comes back to the control that opened it on close.
   A reader hears the title and the count once. */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Download, X } from "lucide-react";
import { Button, Card } from "./primitives";

export interface RestorePreview {
  /** Where the candidate comes from: a file's name or a backup's. */
  source: string;
  changes: string[];
}

interface Props {
  preview: RestorePreview;
  onConfirm: () => void;
  onCancel: () => void;
  onExportCurrent: () => void;
}

export function RestoreDialog({ preview, onConfirm, onCancel, onExportCurrent }: Props) {
  const id = useId();
  const card = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);
  const none = preview.changes.length === 0;
  const count = none ? "Nothing would change." : `${preview.changes.length} ${preview.changes.length === 1 ? "change" : "changes"}.`;
  // The polite count is set after the mount (a live region inserted with its text is not reliably read); the dialog's
  // name and description are read when the focus lands on Cancel, so the count is said once more and the title not.
  const [spoken, setSpoken] = useState("");
  useEffect(() => {
    opener.current = document.activeElement;
    cancel.current?.focus();
    const timer = setTimeout(() => setSpoken(`Restore preview: ${count}`), 50);
    return () => {
      clearTimeout(timer);
      const back = opener.current as HTMLElement | null;
      if (back?.isConnected) back.focus?.();
    };
    // Once, at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
      return;
    }
    if (e.key !== "Tab" || !card.current) return;
    const stops = [...card.current.querySelectorAll<HTMLElement>("button:not([disabled])")];
    if (stops.length === 0) return;
    const first = stops[0]!;
    const last = stops[stops.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  return (
    <>
      <div className="jump-scrim" onPointerDown={onCancel} />
      <Card ref={card} className="world-sheet restore-sheet" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-count`} onKeyDown={onKey}>
        <Card.Header title="Restore this town?" titleId={`${id}-title`} action={<Button variant="ghost" size="sm" iconOnly aria-label="Cancel the restore" icon={<X className="icon" aria-hidden="true" />} onClick={onCancel} />} />
        <Card.Body>
          <p id={`${id}-count`} className="restore-count">
            From {preview.source}: {count}
          </p>
          {!none && (
            <ul className="restore-changes">
              {preview.changes.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          <p className="hint">{none ? "The town stays as it is either way." : "The town as it is now stays a revision: Undo goes back to it."}</p>
          <p className="sr-only" role="status" aria-live="polite">
            {spoken}
          </p>
        </Card.Body>
        <Card.Footer className="restore-footer">
          <Button size="sm" icon={<Download className="icon" aria-hidden="true" />} onClick={onExportCurrent}>
            Download the current town first
          </Button>
          <span className="restore-actions">
            <Button ref={cancel} size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" disabled={none} onClick={onConfirm}>
              Restore
            </Button>
          </span>
        </Card.Footer>
      </Card>
    </>
  );
}

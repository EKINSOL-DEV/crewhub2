/* Field primitive (design system: Field): label + one control (input, select or textarea) + hint or error. `control="checkbox"` is
   the variant where the label wraps the box (`.label-option`) and its content can be a chip. The label is
   always present; `hideLabel` keeps it for assistive tech. `inline` drops the column wrapper and the label style so the caller
   can lay label and control in a row; `bare` drops the control's own look (for a control that a parent frames, like quick-ask).
   `autoGrow` is the textarea variant `.textarea-grow` (a message box): one line tall at rest, it grows with its content up to
   the kit's max height and only then scrolls, so a short message never shows a scrollbar. `echo` is loops' CL-119 (crewhub-loops
   d4cf7397), ported here for the copied chat dock (round 69, w5-9): see `useEchoValue`. */
import { useEffect, useId, useLayoutEffect, useRef, useState, type ChangeEvent, type ComponentPropsWithRef, type ReactNode, type Ref } from "react";
import { cx } from "./cx";

interface FieldOwn {
  label: ReactNode;
  hideLabel?: boolean;
  hint?: ReactNode;
  /** Replaces the hint, in `danger`, and marks the control aria-invalid. */
  error?: ReactNode;
  inline?: boolean | undefined;
  bare?: boolean;
  /** Textarea only: grow with the content up to the max height, then scroll. */
  autoGrow?: boolean;
  /** Input and textarea only: keep the typed text and the caret when the owner stores the value late (see `useEchoValue`). Never with a normalising owner. */
  echo?: boolean;
  /** Class of the wrapper; `controlClassName` is for the control. */
  className?: string;
  controlClassName?: string;
}
export type FieldProps = FieldOwn &
  (
    | ({ control?: "input"; size?: "md" | "sm" } & Omit<ComponentPropsWithRef<"input">, "className" | "size">)
    | ({ control: "file"; size?: "md" | "sm" } & Omit<ComponentPropsWithRef<"input">, "className" | "size" | "type">)
    | ({ control: "select"; size?: "md" | "sm" } & Omit<ComponentPropsWithRef<"select">, "className" | "size">)
    | ({ control: "textarea"; size?: undefined } & Omit<ComponentPropsWithRef<"textarea">, "className" | "size">)
    | ({ control: "checkbox"; size?: undefined } & Omit<ComponentPropsWithRef<"input">, "className" | "size" | "type">)
  );

/* `echo` (opt-in, loops' CL-119): for a controlled text control whose owner stores the value asynchronously (the chat draft is a
   query-cache entry whose notification comes a macrotask later). Such an owner rewrites the DOM value with a stale one after each
   keystroke: React restores the controlled value at the end of the input event, so the next key edits the stale text (a character
   lost) and the caret lands at the end. With `echo` the control shows a local copy, set synchronously in the change handler, so the
   DOM value is never behind the typed text. The owner's value is adopted only when it is one we did not emit (a draft restored, a
   thread switched, a reset after send); the values we did emit are remembered, and an echo older than the last acknowledged one,
   while newer ones are still in flight, is ignored, so a slow owner cannot roll the text back mid-typing. Do NOT use it for an
   owner that normalises the value (lowercase, trim, clamp): the normalised value equals what the owner already holds, so it would
   never be adopted. Without `echo` a Field is stock React. */
function useEchoValue<E extends HTMLInputElement | HTMLTextAreaElement>(on: boolean, value: unknown, onChange: ((e: ChangeEvent<E>) => void) | undefined) {
  const live = on && typeof value === "string";
  const [shown, setShown] = useState(live ? value : "");
  const [seen, setSeen] = useState(value);
  const [track, setTrack] = useState<{ list: string[]; acked: number }>({ list: [], acked: -1 });
  if (live && value !== seen) {
    setSeen(value);
    const at = track.list.lastIndexOf(value);
    const inFlight = track.list.length - 1 > track.acked;
    if (at > track.acked) setTrack({ list: track.list, acked: at });
    else if (at >= 0 && inFlight) {
      /* an echo older than one already acknowledged, with newer text in flight: stale, ignore */
    } else {
      setTrack({ list: [], acked: -1 });
      setShown(value);
    }
  }
  if (!live) return { value: value as string | undefined, onChange };
  return {
    value: shown,
    onChange: (e: ChangeEvent<E>) => {
      const next = e.target.value;
      setTrack((t) => ({ list: [...t.list, next], acked: t.acked }));
      setShown(next);
      onChange?.(e);
    },
  };
}

function EchoInput({ echo, ...props }: ComponentPropsWithRef<"input"> & { echo: boolean }) {
  const { value, onChange, ...rest } = props;
  return <input {...rest} {...useEchoValue<HTMLInputElement>(echo, value, onChange)} />;
}

function EchoTextarea({ grow, echo, ...props }: ComponentPropsWithRef<"textarea"> & { grow: boolean; echo: boolean }) {
  const { value, onChange, ...rest } = props;
  const own = useEchoValue<HTMLTextAreaElement>(echo, value, onChange);
  return grow ? <GrowingTextarea {...rest} {...own} /> : <textarea {...rest} {...own} />;
}

export function Field(props: FieldProps) {
  const { label, hideLabel, hint, error, size, inline, bare, autoGrow, echo = false, className, controlClassName, control = "input", ...rest } = props;
  const auto = useId();
  const id = (rest as { id?: string }).id ?? auto;
  const noteId = `${id}-note`;
  const note = error || hint;
  const grow = control === "textarea" && !!autoGrow;
  const describedBy = cx((rest as { "aria-describedby"?: string })["aria-describedby"], note ? noteId : undefined) || undefined;
  if (control === "checkbox") {
    /* The label wraps the box and carries the content (a chip, a name); no column wrapper, no `.input` look. */
    return (
      <>
        <label className={cx("label-option", className)} htmlFor={id}>
          <input {...(rest as ComponentPropsWithRef<"input">)} id={id} type="checkbox" className={controlClassName} aria-describedby={describedBy} aria-invalid={error ? true : undefined} />
          {hideLabel ? <span className="sr-only">{label}</span> : label}
        </label>
        {note ? (
          <div className="hint" id={noteId} style={error ? { color: "var(--danger)" } : undefined}>
            {note}
          </div>
        ) : null}
      </>
    );
  }
  const base = bare ? undefined : control === "file" ? "input input-file" : control;
  const cls = cx(base, grow && "textarea-grow", !bare && size === "sm" && control !== "textarea" && `${control === "file" ? "input" : control}-sm`, controlClassName);
  const common = { id, className: cls || undefined, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined };
  return (
    <div className={cx(!inline && "field", className)}>
      <label className={hideLabel ? "sr-only" : inline ? undefined : "label"} htmlFor={id}>
        {label}
      </label>
      {control === "select" ? (
        <select {...(rest as ComponentPropsWithRef<"select">)} {...common} />
      ) : control === "textarea" ? (
        <EchoTextarea {...(rest as ComponentPropsWithRef<"textarea">)} {...common} grow={grow} echo={echo} />
      ) : control === "file" ? (
        <input {...(rest as ComponentPropsWithRef<"input">)} {...common} type="file" />
      ) : (
        <EchoInput {...(rest as ComponentPropsWithRef<"input">)} {...common} type={(rest as ComponentPropsWithRef<"input">).type} echo={echo} />
      )}
      {note ? (
        <div className="hint" id={noteId} style={error ? { color: "var(--danger)" } : undefined}>
          {note}
        </div>
      ) : null}
    </div>
  );
}

/* The auto-grow textarea keeps the caller's ref and onInput; an uncontrolled one is fitted on every input, and any one
   again when what decides its wrapping changes: its width (a dialog that opens, a narrower window), or its text metrics
   (a web font that finishes loading, a text-size or zoom change) at the very same width. The height is fixed and the
   overflow hidden, so a stale height would clip the text. Every trigger goes through `refit`, which only fits when the
   width or the text metrics differ from the last fit; the fit's own style write therefore cannot start a loop. The font
   events always fit: a loaded font changes the glyph metrics while the computed CSS values stay the same. */
function GrowingTextarea({ ref, onInput, ...rest }: ComponentPropsWithRef<"textarea">) {
  const own = useRef<HTMLTextAreaElement | null>(null);
  const seen = useRef("");
  const setRef = (node: HTMLTextAreaElement | null) => {
    own.current = node;
    return passRef(ref, node);
  };
  useLayoutEffect(() => {
    fitTextarea(own.current);
    seen.current = textShape(own.current);
  }, [rest.value]);
  useEffect(() => {
    const node = own.current;
    if (!node) return;
    seen.current = textShape(node);
    /* `force` is for the font events: the fallback swapped for the loaded font changes the glyph metrics but not
       the computed CSS values `textShape` reads, so the shape guard would wrongly skip the fit. */
    const refit = (force?: boolean) => {
      const shape = textShape(node);
      if (force !== true && shape === seen.current) return;
      seen.current = shape;
      fitTextarea(node);
    };
    const watched = () => refit();
    const stops: (() => void)[] = [];
    if (typeof ResizeObserver !== "undefined") {
      const watch = new ResizeObserver(watched);
      watch.observe(node);
      stops.push(() => watch.disconnect());
    }
    if (typeof MutationObserver !== "undefined") {
      const watch = new MutationObserver(watched);
      const attributes = { attributes: true, attributeFilter: ["style", "class", "lang"] };
      watch.observe(node, attributes);
      watch.observe(document.documentElement, attributes);
      stops.push(() => watch.disconnect());
    }
    const fonts = document.fonts;
    if (fonts) {
      let live = true;
      const fontsDone = () => {
        if (live) refit(true);
      };
      fonts.addEventListener?.("loadingdone", fontsDone);
      stops.push(() => {
        live = false;
        fonts.removeEventListener?.("loadingdone", fontsDone);
      });
      void fonts.ready?.then(fontsDone);
    }
    window.addEventListener("resize", watched);
    stops.push(() => window.removeEventListener("resize", watched));
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", watched);
    stops.push(() => viewport?.removeEventListener("resize", watched));
    return () => stops.forEach((stop) => stop());
  }, []);
  const input: NonNullable<ComponentPropsWithRef<"textarea">["onInput"]> = (e) => {
    fitTextarea(e.currentTarget);
    onInput?.(e);
  };
  return <textarea {...rest} ref={setRef} onInput={input} />;
}

function passRef<T>(ref: Ref<T> | undefined, node: T | null) {
  if (typeof ref === "function") return ref(node);
  if (ref) ref.current = node;
}

/* What decides where the text wraps: the box width and the font. */
function textShape(field: HTMLTextAreaElement | null) {
  if (!field) return "";
  const s = getComputedStyle(field);
  return [field.offsetWidth, s.fontFamily, s.fontSize, s.fontWeight, s.fontStretch, s.letterSpacing, s.wordSpacing, s.lineHeight, s.paddingLeft, s.paddingRight].join("|");
}

/* scrollHeight leaves the border out and the box is border-box, so the border is added back: without it the box is two
   pixels short of its content and shows a scrollbar at rest (T79). The bar is only switched on past the max height. */
function fitTextarea(field: HTMLTextAreaElement | null) {
  if (!field) return;
  const style = getComputedStyle(field);
  const edge = (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
  const max = parseFloat(style.maxHeight);
  field.style.height = "0px";
  const wanted = field.scrollHeight + edge;
  const over = Number.isFinite(max) && wanted > max;
  field.style.height = `${over ? max : wanted}px`;
  field.toggleAttribute("data-overflow", over);
}

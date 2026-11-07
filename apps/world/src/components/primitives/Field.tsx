/* Field primitive (design system: Field): label + one control (input, select or textarea) + hint or error. `control="checkbox"` is
   the variant where the label wraps the box (`.label-option`) and its content can be a chip. The label is
   always present; `hideLabel` keeps it for assistive tech. `inline` drops the column wrapper and the label style so the caller
   can lay label and control in a row; `bare` drops the control's own look (for a control that a parent frames, like quick-ask).
   `autoGrow` is the textarea variant `.textarea-grow` (a message box): one line tall at rest, it grows with its content up to
   the kit's max height and only then scrolls, so a short message never shows a scrollbar. */
import { useEffect, useId, useLayoutEffect, useRef, type ComponentPropsWithRef, type ReactNode, type Ref } from "react";
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

export function Field(props: FieldProps) {
  const { label, hideLabel, hint, error, size, inline, bare, autoGrow, className, controlClassName, control = "input", ...rest } = props;
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
        grow ? <GrowingTextarea {...(rest as ComponentPropsWithRef<"textarea">)} {...common} /> : <textarea {...(rest as ComponentPropsWithRef<"textarea">)} {...common} />
      ) : (
        <input {...(rest as ComponentPropsWithRef<"input">)} {...common} type={control === "file" ? "file" : (rest as ComponentPropsWithRef<"input">).type} />
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

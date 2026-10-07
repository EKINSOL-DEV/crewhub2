// Source: crewhub-loops apps/web/src/components/primitives/Menu.tsx @ a1bed0f. Copied verbatim; do not edit here, change the source and re-copy.
/* Menu primitive (design system: Menu): a dropdown of a short list of actions or choices, opened from a Button.
   Escape closes it and returns focus to the trigger, an outside press or Tab closes it, arrows/Home/End move focus.
   `multiple` makes the rows checkboxes that keep the menu open (filters); otherwise a row is an action that closes it.
   Variant `trigger: "context"` has no trigger button: it opens at a point (the pointer, or a focused element via the ContextMenu
   key / Shift+F10, see `useContextMenu`), supports `submenu` rows (→ opens, ← closes) and one inline `form` after the list.
   Variant `trigger: "combobox"` opens from a Field instead of a Button: typing in the field fills the list (ARIA combobox +
   listbox). The focus stays in the field; arrows move the active row, Enter or a click chooses it, Escape closes the list. */
import {
  useCallback, useEffect, useId, useLayoutEffect, useRef, useState,
  type FormEvent, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Icon } from "../Icon";
import { Button, type ButtonVariant } from "./Button";
import { cx } from "./cx";
import { Field } from "./Field";

export type MenuItem =
  | {
      label: string; value?: string; hint?: string; icon?: ReactNode; danger?: boolean; checked?: boolean; onSelect?: () => void;
      /** Context variant only: choosing the row does not close the menu (with `checked`, a checkbox row: several toggles in a row). */
      keepOpen?: boolean;
      /** Context variant only: the row unfolds these items under itself instead of acting. */
      submenu?: MenuItem[];
      /** Combobox variant only: a chip at the end of the row (a ticket's status). */
      trail?: ReactNode;
    }
  | { separator: true }
  | { group: string };

/** Context variant only: a one-line input with a submit button under the list. `onSubmit` returns whether it worked; only then the menu closes. */
export interface MenuForm {
  label: string;
  placeholder?: string;
  submitLabel: string;
  onSubmit: (text: string) => boolean | Promise<boolean>;
}

export interface ContextMenuProps {
  trigger: "context";
  /** Viewport point the menu opens at; null = closed. */
  at: { x: number; y: number } | null;
  /** `refocus`: give the focus back to the element the menu was opened from. */
  onClose: (refocus: boolean) => void;
  items: MenuItem[];
  /** An inline form after the list (a quick comment). It is a `role="group"`, not a menu row: arrows still reach its input and button. */
  form?: MenuForm;
  /** Accessible name of the list. */
  name: string;
}

export interface DropdownMenuProps {
  /** `variant: "chip"` makes the trigger a `button.chip.chip-menu` (a value that opens its choices, e.g. a ticket's status) with the
      `.menu-caret` chevron, at the control height;
      `className`, `data` (rendered as `data-*`) and `disabled` (aria-disabled, does not open) are for that variant; `ariaLabel`
      names either kind, for a trigger whose label is only an icon. */
  trigger: {
    label: ReactNode;
    icon?: ReactNode;
    variant?: ButtonVariant | "chip";
    size?: "md" | "sm";
    active?: boolean;
    className?: string;
    data?: Record<string, string>;
    ariaLabel?: string;
    disabled?: boolean;
  } & (
    | { iconOnly?: false }
    /** Icon-only button trigger: the label is not drawn, so the accessible name is required. */
    | { iconOnly: true; ariaLabel: string }
  );
  items: MenuItem[];
  /** Accessible name of the list. */
  name?: string;
  align?: "start" | "end";
  multiple?: boolean;
  onSelect?: (item: MenuItem) => void;
  className?: string;
  /** Which row takes focus when the menu opens: the first (default) or the checked one, else the first. */
  initialFocus?: "first" | "checked";
}

export interface ComboboxMenuProps {
  trigger: "combobox";
  /** The Field that is the combobox. Its label is always there; `hideLabel` keeps it for assistive tech only. */
  field: { label: string; hideLabel?: boolean; placeholder?: string; size?: "md" | "sm"; id?: string; maxLength?: number };
  text: string;
  onText: (text: string) => void;
  /** The rows that match the text (`label`, `hint`, `trail`, `checked`, `onSelect`); separators and group labels are not drawn. */
  items: MenuItem[];
  /** One line about the list ("3 tickets match", "No ticket matches"): always announced, and shown in place of an empty list. */
  status?: string;
  /** The rows are not the answer to the text yet: they show but cannot be chosen (`aria-disabled`, no active row); Enter
      waits for the answer and then chooses its first row. */
  busy?: boolean;
  /** Accessible name of the list. */
  name: string;
  /** Rows are checked one by one (`checked`) and the list stays open; otherwise choosing a row closes it. */
  multiple?: boolean;
  className?: string;
}

export type MenuProps = DropdownMenuProps | ContextMenuProps | ComboboxMenuProps;

export function Menu(props: MenuProps) {
  if (props.trigger === "context") return <ContextMenu {...props} />;
  if (props.trigger === "combobox") return <ComboboxMenu {...props} />;
  return <DropdownMenu {...props} />;
}

function DropdownMenu({ trigger, items, name, align = "start", multiple, onSelect, className, initialFocus = "first" }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const chip = trigger.variant === "chip";
  const id = useId();
  const triggerId = `${id}-trigger`;
  const rows = () => Array.from(list.current?.querySelectorAll<HTMLElement>(".menu-item") ?? []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  /* Focus enters the menu when it opens. */
  useEffect(() => {
    if (!open) return;
    const all = rows();
    const checked = initialFocus === "checked" ? all.find((r) => r.getAttribute("aria-checked") === "true") : undefined;
    (checked ?? all[0])?.focus();
  }, [open, initialFocus]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      close(true);
      return;
    }
    if (e.key === "Tab" && open) {
      setOpen(false);
      return;
    }
    const all = rows();
    const at = all.indexOf(document.activeElement as HTMLElement);
    if (e.target === button.current) {
      if (e.key === "ArrowDown" && !open && !trigger.disabled) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    const move = (to: number) => {
      e.preventDefault();
      all[(to + all.length) % all.length]?.focus();
    };
    if (e.key === "ArrowDown") move(at + 1);
    else if (e.key === "ArrowUp") move(at - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(all.length - 1);
  };

  return (
    <div className={cx("menu-wrap", className)} ref={wrap} onKeyDown={onKeyDown}>
      {chip ? (
        <button
          ref={button}
          id={triggerId}
          type="button"
          className={cx("chip chip-menu", trigger.className)}
          {...Object.fromEntries(Object.entries(trigger.data ?? {}).map(([k, v]) => [`data-${k}`, v]))}
          aria-haspopup="menu"
          aria-controls={id}
          aria-expanded={open}
          aria-label={trigger.ariaLabel}
          aria-disabled={trigger.disabled || undefined}
          onClick={() => !trigger.disabled && setOpen((o) => !o)}
        >
          {trigger.icon}
          {trigger.label}
          <Icon name="chevron-down" className="menu-caret" />
        </button>
      ) : (
        <Button
          ref={button}
          id={triggerId}
          size={trigger.size ?? "sm"}
          variant={trigger.variant as ButtonVariant | undefined}
          icon={trigger.icon}
          {...(trigger.iconOnly ? { iconOnly: true as const, "aria-label": trigger.ariaLabel } : { "aria-label": trigger.ariaLabel })}
          aria-haspopup="menu"
          aria-controls={id}
          expanded={open}
          data-active={trigger.active ? "" : undefined}
          onClick={() => setOpen((o) => !o)}
        >
          {trigger.label}
        </Button>
      )}
      <ul className={cx("menu", align === "end" && "menu-end")} id={id} role="menu" aria-label={name} aria-labelledby={name ? undefined : triggerId} hidden={!open} ref={list}>
        {items.map((item, i) => {
          if ("separator" in item) return <li className="menu-sep" role="separator" key={i} />;
          if ("group" in item)
            return (
              <li className="menu-label" role="presentation" key={i}>
                {item.group}
              </li>
            );
          return (
            <li role="none" key={item.value ?? i}>
              <button
                type="button"
                className={cx("menu-item", item.danger && "is-danger")}
                role={item.checked === undefined ? "menuitem" : multiple ? "menuitemcheckbox" : "menuitemradio"}
                aria-checked={item.checked}
                tabIndex={-1}
                onClick={() => {
                  item.onSelect?.();
                  onSelect?.(item);
                  if (!multiple) close(true);
                }}
              >
                {item.icon}
                {item.label}
                {item.hint ? <span className="menu-hint">{item.hint}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* -- combobox variant --------------------------------------------------------------------------------------------- */

type MenuRow = Extract<MenuItem, { label: string }>;
const rowId = (r: MenuRow) => r.value ?? r.label;

function ComboboxMenu({ field, text, onText, items, status, busy, name, multiple, className }: ComboboxMenuProps) {
  const rows = items.filter((i): i is MenuRow => "label" in i);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  /* Enter was pressed while the rows were not the answer yet. */
  const wanted = useRef(false);
  const id = useId();
  const which = rows.map(rowId).join("\n");
  const expanded = open && rows.length > 0;
  /* The active row, or -1 while the rows are not the answer. */
  const at = busy ? -1 : Math.min(active, rows.length - 1);

  const choose = (row: MenuRow) => {
    row.onSelect?.();
    if (!multiple) setOpen(false);
  };
  /* Other rows: the first one is the active one again. */
  useEffect(() => setActive(0), [which]);
  useEffect(() => {
    if (busy || !wanted.current) return;
    wanted.current = false;
    if (open && rows[0]) choose(rows[0]);
    // Only the arrival of the answer chooses; `rows` and `choose` are those of that render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, which]);
  useEffect(() => {
    if (expanded) list.current?.querySelector<HTMLElement>("[data-active]")?.scrollIntoView?.({ block: "nearest" });
  }, [expanded, at, which]);

  const close = () => {
    wanted.current = false;
    setOpen(false);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!expanded) return setOpen(true);
      if (!busy) setActive((at + (e.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length);
    } else if (e.key === "Enter") {
      if (!open) return;
      e.preventDefault();
      if (busy) wanted.current = true;
      else if (rows[at]) choose(rows[at]);
    } else if (e.key === "Escape") {
      if (!open || !(rows.length || status)) return;
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "Tab") close();
  };

  return (
    <div className={cx("menu-wrap menu-combobox", className)} ref={wrap} onBlur={(e) => !wrap.current?.contains(e.relatedTarget as Node | null) && close()}>
      <Field
        {...field}
        inline={field.hideLabel}
        role="combobox"
        aria-expanded={expanded}
        aria-controls={id}
        aria-autocomplete="list"
        aria-activedescendant={expanded && at >= 0 ? `${id}-${at}` : undefined}
        autoComplete="off"
        value={text}
        onChange={(e) => {
          wanted.current = false;
          onText(e.target.value);
          setOpen(true);
        }}
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {/* A press on a row must not take the focus out of the field. */}
      <ul className="menu" id={id} role="listbox" aria-label={name} aria-multiselectable={multiple || undefined} aria-busy={busy || undefined} hidden={!expanded} ref={list} onMouseDown={(e) => e.preventDefault()}>
        {rows.map((row, i) => (
          <li
            key={rowId(row)}
            id={`${id}-${i}`}
            role="option"
            className="menu-item"
            aria-selected={multiple ? !!row.checked : i === at}
            aria-disabled={busy || undefined}
            data-active={i === at ? "" : undefined}
            data-checked={row.checked ? "" : undefined}
            onMouseMove={() => !busy && i !== at && setActive(i)}
            onClick={() => !busy && choose(row)}
          >
            {row.icon}
            <span className="menu-text">{row.label}</span>
            {row.hint ? <span className="menu-hint">{row.hint}</span> : null}
            {row.trail}
          </li>
        ))}
      </ul>
      <div className={open && !rows.length && status ? "menu menu-note" : "sr-only"} role="status">
        {open ? status : null}
      </div>
    </div>
  );
}

/* -- context variant ---------------------------------------------------------------------------------------------- */

const MARGIN = 8;
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 8;
type Point = { x: number; y: number };

/* State and event handlers that open a ContextMenu from an element: right click, the ContextMenu key / Shift+F10 on the
   focused element, and a touch long press. Spread `bind` on the element; render <Menu trigger="context" at={at} .../> as its
   sibling (not inside a link). Events that come from the menu itself (a portal) are ignored. */
export function useContextMenu() {
  const [at, setAt] = useState<Point | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);
  const touched = useRef(false);
  const swallowClick = useRef(false);
  const own = (e: { currentTarget: Element; target: EventTarget }) => e.currentTarget.contains(e.target as Node);

  const cancelPress = useCallback(() => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  }, []);
  const openAt = (el: HTMLElement, p: Point) => {
    opener.current = el;
    setAt(p);
  };
  const onClose = useCallback((refocus: boolean) => {
    setAt(null);
    if (refocus && opener.current?.isConnected) opener.current.focus();
  }, []);
  useEffect(() => cancelPress, [cancelPress]);

  const bind = {
    onContextMenu: (e: ReactMouseEvent<HTMLElement>) => {
      if (!own(e)) return;
      e.preventDefault();
      if (touched.current) swallowClick.current = true;
      openAt(e.currentTarget, { x: e.clientX, y: e.clientY });
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (!own(e) || !(e.key === "ContextMenu" || (e.shiftKey && e.key === "F10"))) return;
      e.preventDefault();
      const r = e.currentTarget.getBoundingClientRect();
      openAt(e.target as HTMLElement, { x: r.left + Math.min(24, r.width / 2), y: r.bottom - 8 });
    },
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      swallowClick.current = false; /* a new touch is a new gesture: a tap after a long press follows the link */
      touched.current = e.pointerType === "touch";
      if (!own(e) || e.pointerType !== "touch") return;
      cancelPress();
      const el = e.currentTarget;
      const p = { x: e.clientX, y: e.clientY };
      press.current = {
        ...p,
        timer: window.setTimeout(() => {
          press.current = null;
          swallowClick.current = true;
          openAt(el, p);
        }, LONG_PRESS_MS),
      };
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const p = press.current;
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > LONG_PRESS_SLOP) cancelPress();
    },
    onPointerUp: cancelPress,
    onPointerCancel: cancelPress,
    /* The finger lifting after a long press must not follow the card's link. */
    onClickCapture: (e: ReactMouseEvent<HTMLElement>) => {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };
  return { at, onClose, bind };
}

const FOCUSABLE = ".menu-item, .menu-input, .menu-submit";
/* A scroll or resize caused by the on-screen keyboard while typing in the form must not close the menu. */
const typing = (root: HTMLElement | null) => !!root && root.contains(document.activeElement) && !!document.activeElement?.matches(".menu-input, .menu-submit");

function ContextMenu({ at, onClose, items, form, name }: ContextMenuProps) {
  const root = useRef<HTMLDivElement>(null);
  const [sub, setSub] = useState<number | null>(null);
  const [pos, setPos] = useState<Point | null>(null);
  const id = useId();
  const rows = () => Array.from(root.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((r) => !r.closest("[hidden]") && !(r as HTMLButtonElement).disabled);

  useEffect(() => setSub(null), [at]);
  /* Keep the menu inside the viewport: measured after it renders, again when a submenu changes its height. */
  useLayoutEffect(() => {
    const el = root.current;
    if (!at || !el) return setPos(null);
    const { width, height } = el.getBoundingClientRect();
    setPos({
      x: Math.max(MARGIN, Math.min(at.x, window.innerWidth - width - MARGIN)),
      y: Math.max(MARGIN, Math.min(at.y, window.innerHeight - height - MARGIN)),
    });
  }, [at, sub]);
  useEffect(() => {
    if (at && pos) rows()[0]?.focus();
    // Focus enters once, when the menu first has its place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, pos === null]);
  useEffect(() => {
    if (!at) return;
    const outside = (e: Event) => !root.current?.contains(e.target as Node);
    const press = (e: Event) => outside(e) && onClose(false);
    const scroll = (e: Event) => outside(e) && !typing(root.current) && onClose(false);
    const resize = () => !typing(root.current) && onClose(false);
    const blur = () => onClose(false);
    document.addEventListener("mousedown", press);
    window.addEventListener("blur", blur);
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("mousedown", press);
      window.removeEventListener("blur", blur);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [at, onClose]);

  if (!at) return null;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const inInput = (e.target as HTMLElement).classList.contains("menu-input");
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      const inSub = (e.target as HTMLElement).closest<HTMLElement>(".menu-sub");
      if (inSub) {
        /* Escape inside a submenu folds only that submenu and gives the focus back to its row; the next Escape closes the menu. */
        setSub(null);
        inSub.closest("li.menu-has-sub")?.querySelector<HTMLElement>(":scope > .menu-item")?.focus();
        return;
      }
      onClose(true);
      return;
    }
    if (e.key === "Tab") {
      onClose(false);
      return;
    }
    const all = rows();
    const at0 = all.indexOf(document.activeElement as HTMLElement);
    const move = (to: number) => {
      e.preventDefault();
      all[(to + all.length) % all.length]?.focus();
    };
    const row = (e.target as HTMLElement).closest<HTMLElement>(".menu-item");
    if (e.key === "ArrowDown") move(at0 + 1);
    else if (e.key === "ArrowUp") move(at0 - 1);
    else if (!inInput && e.key === "Home") move(0);
    else if (!inInput && e.key === "End") move(all.length - 1);
    else if (e.key === "ArrowRight" && row?.getAttribute("aria-haspopup") === "menu") {
      e.preventDefault();
      const i = Number(row.dataset.sub);
      if (sub !== i) setSub(i);
      requestAnimationFrame(() => row.parentElement?.querySelector<HTMLElement>(".menu-sub .menu-item")?.focus());
    } else if (e.key === "ArrowLeft" && row?.closest(".menu-sub")) {
      e.preventDefault();
      const parent = row.closest("li.menu-has-sub")?.querySelector<HTMLElement>(":scope > .menu-item");
      setSub(null);
      parent?.focus();
    } else if (e.key === "ArrowLeft" && row?.getAttribute("aria-haspopup") === "menu" && sub !== null) {
      e.preventDefault();
      setSub(null);
    }
  };

  const renderItem = (item: MenuItem, i: number): ReactNode => {
    if ("separator" in item) return <li className="menu-sep" role="separator" key={i} />;
    if ("group" in item)
      return (
        <li className="menu-label" role="presentation" key={i}>
          {item.group}
        </li>
      );
    if (item.submenu) {
      const open = sub === i;
      return (
        <li role="none" className="menu-has-sub" key={i}>
          <button
            type="button"
            className="menu-item"
            role="menuitem"
            data-sub={i}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={`${id}-sub-${i}`}
            tabIndex={-1}
            onClick={() => setSub(open ? null : i)}
          >
            {item.icon}
            {item.label}
          </button>
          <ul className="menu-sub" id={`${id}-sub-${i}`} role="menu" aria-label={item.label} hidden={!open}>
            {item.submenu.map(renderItem)}
          </ul>
        </li>
      );
    }
    return (
      <li role="none" key={item.value ?? i}>
        <button
          type="button"
          className={cx("menu-item", item.danger && "is-danger")}
          role={item.checked === undefined ? "menuitem" : item.keepOpen ? "menuitemcheckbox" : "menuitemradio"}
          aria-checked={item.checked}
          tabIndex={-1}
          onClick={() => {
            item.onSelect?.();
            if (!item.keepOpen) onClose(true);
          }}
        >
          {item.icon}
          {item.label}
          {item.hint ? <span className="menu-hint">{item.hint}</span> : null}
        </button>
      </li>
    );
  };

  return createPortal(
    <div
      ref={root}
      className="menu menu-context"
      style={{ left: pos?.x ?? at.x, top: pos?.y ?? at.y, visibility: pos ? undefined : "hidden" }}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      <ul role="menu" aria-label={name}>
        {items.map(renderItem)}
      </ul>
      {form ? <ContextForm {...form} onDone={() => onClose(true)} /> : null}
    </div>,
    document.body,
  );
}

function ContextForm({ label, placeholder, submitLabel, onSubmit, onDone }: MenuForm & { onDone: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    const ok = await onSubmit(text);
    setBusy(false);
    if (ok) onDone();
  };
  return (
    <div role="group" aria-label={label}>
      <form className="menu-field" onSubmit={(e) => void submit(e)}>
        <Field
          size="sm"
          label={label}
          hideLabel
          placeholder={placeholder}
          value={text}
          controlClassName="menu-input"
          autoComplete="off"
          onChange={(e) => setText(e.target.value)}
        />
        <Button size="sm" variant="primary" type="submit" className="menu-submit" disabled={busy || !text.trim()}>
          {submitLabel}
        </Button>
      </form>
    </div>
  );
}

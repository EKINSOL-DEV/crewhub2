/* Button primitive (design system: Button). One `.btn` with at most one variant class (`avatar` and `toolbar` are the two
   toggle looks with their own class); `href` renders an anchor with the same look (no router here). `avatar` is the avatar toggle variant (`.avatar-toggle`, aria-pressed). */
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { cx } from "./cx";

export type ButtonVariant = "default" | "primary" | "accent" | "ghost" | "danger" | "link" | "avatar" | "toolbar";

interface ButtonOwn {
  /** default: outlined. primary: ink. accent: coral, only the action that sends. ghost: toolbar. danger: destructive. link: looks like an inline text link, for a navigation action inside a message (usually with `href`). avatar: avatar toggle. toolbar: the editor toolbar's icon toggle (`.toolbar-btn`, use `pressed`). */
  variant?: ButtonVariant | undefined;
  /** md = 36px (default), sm = 28px. */
  size?: "md" | "sm";
  /** Leading icon element, e.g. `<Icon name="plus" size="sm" />`. */
  icon?: ReactNode;
  /** Keyboard hint after the label (`.btn-kbd`). */
  kbd?: string;
  className?: string;
  children?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}
/* An icon-only button has no visible text, so it must carry an accessible name. */
type IconOnly = { iconOnly?: false } | { iconOnly: true; "aria-label": string };

export type ButtonProps = ButtonOwn &
  IconOnly &
  (
    | (Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & {
        /** aria-expanded, for a button that opens something. */
        expanded?: boolean;
        /** aria-pressed, for a toggle. */
        pressed?: boolean;
        href?: undefined;
      })
    | (Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "children"> & { href: string })
  );

export function Button(props: ButtonProps) {
  const { variant = "default", size = "md", icon, iconOnly, kbd, className, children, ...rest } = props;
  const cls =
    variant === "avatar"
      ? cx("avatar-toggle", className)
      : variant === "toolbar"
        ? cx("toolbar-btn", className)
        : cx("btn", variant !== "default" && `btn-${variant}`, size === "sm" && "btn-sm", iconOnly && "btn-icon", className);
  const inner = (
    <>
      {icon}
      {iconOnly ? null : children}
      {kbd ? <span className="btn-kbd">{kbd}</span> : null}
    </>
  );
  if (rest.href !== undefined)
    return (
      <a className={cls} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {inner}
      </a>
    );
  const { type = "button", expanded, pressed, ...button } = rest as ButtonHTMLAttributes<HTMLButtonElement> & { expanded?: boolean; pressed?: boolean };
  return (
    <button className={cls} type={type} aria-expanded={expanded} aria-pressed={pressed} {...button}>
      {inner}
    </button>
  );
}

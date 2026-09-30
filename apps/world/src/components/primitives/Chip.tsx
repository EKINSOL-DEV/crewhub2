/* Chip primitive (design system: Chip): the small inline token for a fact. The base chip plus Chip.Status, Chip.Stalled
   and Chip.Attention. Status values use the kit's spelling.
   Not ported from crewhub-loops (crewhub2 has no tickets): Priority, Person, Label, Waiting, Blocked, Progress, Link,
   Delivery, and the base chip's Avatar refusal (it needs loops' Avatar). */
import { CircleAlert, Clock, type LucideIcon } from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cx } from "./cx";

export type KitStatus = "backlog" | "planned" | "progress" | "review" | "done";

type SpanProps = Omit<ComponentPropsWithoutRef<"span">, "children">;

/* With an `href` the base chip is a plain anchor (`a.chip`), e.g. a jump link to another part of the page. */
function ChipRoot({ children, icon, className, href, ...rest }: SpanProps & { children: ReactNode; icon?: ReactNode; href?: string }) {
  if (href !== undefined)
    return (
      <a className={cx("chip", className)} href={href} {...(rest as object)}>
        {icon}
        <span>{children}</span>
      </a>
    );
  return (
    <span className={cx("chip", className)} {...rest}>
      {icon}
      <span>{children}</span>
    </span>
  );
}

/* The kit sizes `.chip .icon` itself; lucide icons get the `icon` class so they size and stroke like the kit's sprite icons. */
const chipIcon = (Glyph: LucideIcon) => <Glyph className="icon icon-sm" aria-hidden="true" />;

/** Status: icon shape first, colour second, then the label. The caller passes the icon (a lucide-react icon with
    `className="icon"`). `iconOnly` is the compact icon for dense rows; `decorative` drops its name where a neighbouring
    heading already carries it. */
function StatusChip({ value, label, icon, iconOnly, decorative }: { value: KitStatus; label: string; icon: ReactNode; iconOnly?: boolean; decorative?: boolean }) {
  if (iconOnly && decorative)
    return (
      <span className="status-icon" data-status={value}>
        {icon}
      </span>
    );
  if (iconOnly)
    return (
      <span className="status-icon" data-status={value} title={label}>
        {icon}
        <span className="sr-only">{label}</span>
      </span>
    );
  return (
    <span className="chip chip-status" data-status={value}>
      {icon}
      <span>{label}</span>
    </span>
  );
}

/** Watchdog: nobody has worked on something for a while (muted, dashed, clock icon). */
function StalledChip({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span className="chip chip-stalled" title={title}>
      {chipIcon(Clock)}
      <span>{children}</span>
    </span>
  );
}

/** Watchdog: an agent is blocked and needs a person (coral, solid, alert icon). */
function AttentionChip({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span className="chip chip-attention" title={title}>
      {chipIcon(CircleAlert)}
      <span>{children}</span>
    </span>
  );
}

export const Chip = Object.assign(ChipRoot, {
  Status: StatusChip,
  Stalled: StalledChip,
  Attention: AttentionChip,
});

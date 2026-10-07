/* Chip primitive (design system: Chip): the small inline token for a fact. The base chip plus Chip.Status, Chip.Stalled,
   Chip.Attention, and the three the copied chat uses: Chip.Person, Chip.Link and Chip.Delivery. Status values use the kit's
   spelling.
   Person, Link and Delivery are ported from crewhub-loops apps/web/src/components/primitives/Chip.tsx @ a1bed0f; Link
   without its router `to` form (no router here). Not ported (no tickets in the world's 2D UI): Priority, Label, Waiting,
   Blocked, Progress, and the base chip's Avatar refusal. */
import { CircleAlert, Clock, type LucideIcon } from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { DeliveryOut, DeliveryState, PrincipalKind } from "../../api/types";
import { useT } from "../../i18n";
import { Avatar } from "../Avatar";
import { Icon, type IconName } from "../Icon";
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

/** A person, an agent or the system: the avatar at the size and inset the chip is built for (`.chip-person`: 4px taller than a fact
    chip, avatar inset from the border so an agent's dot stays inside it), then `children` (default: the name). */
function PersonChip({ person, children, className, ...rest }: SpanProps & { person: { kind: PrincipalKind; displayName: string }; children?: ReactNode }) {
  return (
    <span className={cx("chip chip-person", className)} {...rest}>
      <Avatar kind={person.kind} name={person.displayName} size="xs" />
      <span>{children ?? person.displayName}</span>
    </span>
  );
}

/* A typed link: `type` selects the tint (`data-link`); type icon, key, title and state are optional parts. An `href`
   makes it an anchor, otherwise a span. */
type LinkChipProps = {
  type: string;
  linkKey?: string | undefined;
  title?: ReactNode;
  state?: string | undefined;
  icon?: ReactNode;
  /** Tooltip. */
  hint?: string | undefined;
} & ({ href: string; target?: string; rel?: string } | { href?: undefined });

function LinkChip(props: LinkChipProps) {
  const { type, linkKey, title, state, icon, hint, href } = props;
  const { target, rel } = props as { target?: string; rel?: string };
  const body = (
    <>
      {icon ? <span className="link-type" aria-hidden="true">{icon}</span> : null}
      {linkKey ? <span className="link-key">{linkKey}</span> : null}
      {title ? <span className="link-title">{title}</span> : null}
      {state ? <span className="link-state">{state}</span> : null}
    </>
  );
  const common = { className: "chip chip-link", "data-link": type, title: hint };
  if (href !== undefined) return <a {...common} href={href} target={target} rel={rel}>{body}</a>;
  return <span {...common}>{body}</span>;
}

/** Delivery variant from the kit. Chat deliveries have a null ticketId; the chip reads only state. */
function DeliveryChip({ delivery, answeredAt }: { delivery: Pick<DeliveryOut, "state" | "ticketId">; answeredAt?: string | null }) {
  const { t } = useT();
  const state = answeredAt ? "answered" : delivery.state;
  const icons: Record<DeliveryState | "answered", IconName> = {
    pending: "clock", claimed: "arrow-right", forwarded: "check", uncertain: "help",
    unroutable: "alert", obsolete: "x", answered: "check",
  };
  return (
    <ChipRoot className="chip-delivery" data-state={state} icon={<Icon name={icons[state]} size="sm" />}>
      {state === "answered" ? t("agents.chat.answered") : t(`delivery.${state}`)}
    </ChipRoot>
  );
}

export const Chip = Object.assign(ChipRoot, {
  Status: StatusChip,
  Stalled: StalledChip,
  Attention: AttentionChip,
  Person: PersonChip,
  Link: LinkChip,
  Delivery: DeliveryChip,
});

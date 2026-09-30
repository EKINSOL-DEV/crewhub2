/* Card primitive (design system: Card): a bounded thing. Parts are Card.Header (title left, one small action right),
   Card.Body and Card.Footer. `variant="kanban"` is the compact board card (`.kcard`); `as` picks the element, so a
   board card can be the router Link that is also its drag handle. */
import type { ComponentPropsWithRef, ElementType, ReactNode } from "react";
import { cx } from "./cx";

/* `variant="notice"` is the watchdog notice (`.card.card-notice`, with `state` = stalled | attention as `data-state`). */
type CardOwn<T extends ElementType> = { as?: T; variant?: "kanban" | "notice"; state?: "stalled" | "attention" };
export type CardProps<T extends ElementType = "div"> = CardOwn<T> & Omit<ComponentPropsWithRef<T>, keyof CardOwn<T>>;

function CardRoot<T extends ElementType = "div">({ as, variant, state, className, ...rest }: CardProps<T>) {
  const Tag: ElementType = as ?? "div";
  const base = variant === "kanban" ? "kcard" : variant === "notice" ? "card card-notice" : "card";
  return <Tag className={cx(base, className as string | undefined)} data-state={state} {...rest} />;
}

interface HeaderProps {
  title: ReactNode;
  /** id of the heading, for `aria-labelledby` on the card. */
  titleId?: string;
  action?: ReactNode;
  headingLevel?: 2 | 3;
}
function Header({ title, titleId, action, headingLevel = 2 }: HeaderProps) {
  const Heading = `h${headingLevel}` as "h2" | "h3";
  return (
    <header className="card-header">
      <Heading className="card-title" id={titleId}>
        {title}
      </Heading>
      {action}
    </header>
  );
}

function Body({ className, ...rest }: ComponentPropsWithRef<"div">) {
  return <div className={cx("card-body", className)} {...rest} />;
}

function Footer({ className, ...rest }: ComponentPropsWithRef<"footer">) {
  return <footer className={cx("card-footer", className)} {...rest} />;
}

export const Card = Object.assign(CardRoot, { Header, Body, Footer });

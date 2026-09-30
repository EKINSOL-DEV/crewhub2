import type {
  ButtonHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
  ReactNode,
} from "react";
import {
  ArrowUpRight,
  Check,
  Circle,
  CircleHelp,
  CirclePause,
  CircleX,
  Clock3,
  LoaderCircle,
  Unplug,
  WifiOff,
} from "lucide-react";
import "./tokens.css";
import "./components.css";

export type Theme = "light" | "dark";
export type Status =
  | "working"
  | "needs-input"
  | "needs-approval"
  | "completed"
  | "idle"
  | "stale"
  | "disconnected"
  | "unknown"
  | "failed";

export const statusDefinition = {
  working: { label: "Working", icon: LoaderCircle, tone: "working" },
  "needs-input": { label: "Needs input", icon: CircleHelp, tone: "attention" },
  "needs-approval": {
    label: "Needs approval",
    icon: CirclePause,
    tone: "attention",
  },
  completed: { label: "Completed", icon: Check, tone: "complete" },
  idle: { label: "Idle", icon: Circle, tone: "neutral" },
  stale: { label: "Last known", icon: Clock3, tone: "neutral" },
  disconnected: { label: "Disconnected", icon: WifiOff, tone: "neutral" },
  unknown: { label: "Unknown", icon: CircleHelp, tone: "neutral" },
  failed: { label: "Failed", icon: CircleX, tone: "danger" },
} as const;

export function StatusBadge({
  status,
  children,
}: {
  status: Status;
  children?: ReactNode;
}) {
  const { label, icon: Icon, tone } = statusDefinition[status];
  return (
    <span className="ch-status" data-tone={tone}>
      <Icon size={14} aria-hidden="true" />
      {children ?? label}
    </span>
  );
}

export function Button({
  variant = "secondary",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button
      type="button"
      {...props}
      className={`ch-button ch-button--${variant} ${className}`}
    >
      {children}
    </button>
  );
}

export function IconButton({
  label,
  children,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  label: string;
}) {
  return (
    <Button
      {...props}
      className={`ch-icon-button ${props.className ?? ""}`}
      aria-label={label}
      title={label}
    >
      {children}
    </Button>
  );
}

export function Panel({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <section {...props} className={`ch-panel ${className}`}>
      {children}
    </section>
  );
}

export function RobotAvatar({
  color = "stone",
  size = 44,
}: {
  color?: "stone" | "clay" | "lavender";
  size?: number;
}) {
  return (
    <span
      className={`ch-avatar ch-avatar--${color}`}
      style={{ "--avatar-size": `${size}px` } as CSSProperties}
      aria-hidden="true"
    >
      <span className="ch-avatar-antenna" />
      <span className="ch-avatar-head">
        <span className="ch-avatar-face">
          <i />
          <i />
        </span>
      </span>
    </span>
  );
}

export function SourceBadge({
  source,
  disconnected = false,
}: {
  source: string;
  disconnected?: boolean;
}) {
  return (
    <span className="ch-source">
      {disconnected && <Unplug size={12} aria-hidden="true" />}
      {source}
    </span>
  );
}

export function AgentCard({
  name,
  detail,
  status,
  color,
  selected = false,
  onClick,
}: {
  name: string;
  detail: string;
  status: Status;
  color: "stone" | "clay" | "lavender";
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className="ch-agent-card"
      aria-pressed={selected}
      onClick={onClick}
    >
      <RobotAvatar color={color} />
      <span className="ch-agent-copy">
        <strong>{name}</strong>
        <span>{detail}</span>
      </span>
      <StatusBadge status={status} />
      <ArrowUpRight size={16} className="ch-card-arrow" aria-hidden="true" />
    </button>
  );
}

export function Notice({
  tone = "neutral",
  title,
  children,
  action,
}: {
  tone?: "neutral" | "attention" | "danger";
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="ch-notice" data-tone={tone}>
      <CircleHelp size={18} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
        {action}
      </div>
    </div>
  );
}

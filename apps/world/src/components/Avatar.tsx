/* Source: crewhub-loops apps/web/src/components/Avatar.tsx @ a1bed0f. Unchanged; change it in crewhub-loops.
   People are round, agents are square with a spark, the system is a dashed outline (kit.css). */
import type { PrincipalKind } from "../api/types";
import { useT } from "../i18n";
import { Icon } from "./Icon";

export function Avatar({ kind, name, size = "sm" }: { kind: PrincipalKind; name: string; size?: "xs" | "sm" | "lg" | "md" }) {
  const { t } = useT();
  const cls = ["avatar", kind === "agent" ? "avatar-agent" : kind === "system" ? "avatar-system" : "", size === "md" ? "" : `avatar-${size}`]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls} title={kind === "agent" ? t("avatar.agent", { name }) : name} aria-hidden="true">
      {kind === "system" ? <Icon name="spark" /> : Array.from(name.trim())[0] ?? "?"}
    </span>
  );
}

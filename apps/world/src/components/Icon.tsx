/* Source: crewhub-loops apps/web/src/components/Icon.tsx @ a1bed0f: <Icon name> over the inline icon sprite
   (iconSprite.ts holds the symbols and the sprite element; App mounts <IconSprite /> once). The world's own UI uses
   lucide-react. */
import { type IconName } from "./iconSprite";

export { IconSprite, type IconName } from "./iconSprite";

export function Icon({ name, size, className }: { name: IconName; size?: "sm" | "lg"; className?: string }) {
  const cls = ["icon", size ? `icon-${size}` : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <svg className={cls} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}

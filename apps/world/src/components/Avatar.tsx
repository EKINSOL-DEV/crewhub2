import type { CSSProperties } from "react";

/* A robot's portrait. `color` is the robot's scene colour (identity of the 3D model), not a UI palette colour. */
export function Avatar({ color, size = 44 }: { color: string; size?: number }) {
  return (
    <span
      className="bot-avatar"
      style={
        { "--bot-color": color, width: size, height: size } as CSSProperties
      }
      aria-hidden="true"
    >
      <span className="bot-avatar-antenna" />
      <span className="bot-avatar-head">
        <span className="bot-avatar-visor">
          <i />
          <i />
        </span>
      </span>
    </span>
  );
}

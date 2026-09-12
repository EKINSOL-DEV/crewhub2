import type { CSSProperties } from "react";

export function Avatar({ color, size = 44 }: { color: string; size?: number }) {
  return (
    <span
      className="avatar"
      style={
        { "--bot-color": color, width: size, height: size } as CSSProperties
      }
      aria-hidden="true"
    >
      <span className="avatar-antenna" />
      <span className="avatar-head">
        <span className="avatar-visor">
          <i />
          <i />
        </span>
      </span>
    </span>
  );
}

// All placed props, room by room (EKI-81). Display is dumb: zone center +
// room-local offset → world position, one Prop3D per placement. The lobby
// strip stays unfurnished.
import { useMemo } from "react";
import { LOBBY_ID, type WorldZone } from "../lib/layout";
import { WORLD_PALETTE_FALLBACK, type WorldPalette } from "../lib/theme-palette";
import type { PlacedProp } from "./placement";
import { Prop3D } from "./Prop3D";
import { propColors } from "./registry";

export interface RoomProps3DProps {
  zones: WorldZone[];
  /** Room id → placed props (room-local coordinates). */
  byRoom: Record<string, PlacedProp[]>;
  palette?: WorldPalette | undefined;
  reducedMotion?: boolean;
}

export function RoomProps3D({
  zones,
  byRoom,
  palette = WORLD_PALETTE_FALLBACK,
  reducedMotion = false,
}: RoomProps3DProps) {
  const colors = useMemo(() => propColors(palette), [palette]);

  return (
    <group>
      {zones.map((zone) => {
        if (zone.id === LOBBY_ID) return null;
        const props = byRoom[zone.id];
        if (!props?.length) return null;
        return props.map((p) => (
          <Prop3D
            key={`${zone.id}/${p.id}`}
            placed={p}
            position={[zone.center[0] + p.x, 0, zone.center[1] + p.z]}
            colors={colors}
            reducedMotion={reducedMotion}
          />
        ));
      })}
    </group>
  );
}

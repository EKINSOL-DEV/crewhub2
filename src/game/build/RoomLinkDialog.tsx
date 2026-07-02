// Room-link prompt (M3 T5): shown right after a building is placed, mounted
// by GameShell whenever mode.ts's `pendingRoomLink` is set. Restyled per
// HireDialog/ChatWindow's chunky white/slate game-card look — a centered
// Card over a blurred backdrop, DOM not three.js (this is UI chrome, not
// campus geometry). Picking a room (or "No room") writes `roomId` onto the
// building via the edits store, which PlacedBuildings reads to tint the
// slab edge; skipping leaves it null, a fully valid state.
import { useEffect } from "react";
import { useBindingsStore } from "@/stores/bindings";
import { useCampusEdits } from "./store";

const FALLBACK_COLOR = "#94a3b8";

export function RoomLinkDialog({ buildingId, onClose }: { buildingId: string; onClose: () => void }) {
  const rooms = useBindingsStore((s) => s.rooms);
  const setBuildingRoom = useCampusEdits((s) => s.setBuildingRoom);

  // Escape skips, same convention as HireDialog's backdrop click and
  // BuildControls' own Escape handling — this dialog floats over the canvas
  // for a beat, it shouldn't trap the player.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const pick = (roomId: string | null) => {
    setBuildingRoom(buildingId, roomId);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        data-testid="room-link-dialog"
        className="flex w-[320px] flex-col gap-2 rounded-3xl border-2 border-white/60 bg-white/90 p-4 text-slate-900 shadow-2xl backdrop-blur"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-bold">🏷️ Link a room?</div>
        <ul className="flex max-h-60 flex-col gap-1 overflow-y-auto" data-testid="room-link-list">
          {rooms.length === 0 && <li className="text-sm text-slate-500">No rooms yet.</li>}
          {rooms.map((room) => (
            <li key={room.id}>
              <button
                type="button"
                data-testid={`room-link-room-${room.id}`}
                onClick={() => pick(room.id)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-900/5"
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: room.color ?? FALLBACK_COLOR }}
                />
                {room.name}
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          data-testid="room-link-none"
          onClick={() => pick(null)}
          className="self-start rounded-full border-2 border-slate-900/10 px-3 py-1.5 text-sm hover:bg-slate-900/5"
        >
          No room
        </button>
      </div>
    </div>
  );
}

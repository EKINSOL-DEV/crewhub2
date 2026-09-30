/* A static demo WorldModel for the first-light town, until the scripted DemoSource is wired in by `useWorld`.
   Nothing here describes a running session: the model's mode is "demo" and every surface says so. Only `useWorld`
   imports this file. */
import type { AgentPlacement, Building, LaneStatus, PlaybackControls, PlaybackSpeed, RoleId, RoleSource, TicketStatus, WorldModel } from "@crewhub/world-model";

/** Flip to see the stale-snapshot labels ("stale since HH:MM"); `?stale` in the URL does the same. */
export const FIXTURE_STALE = false;

const NOW = Date.parse("2026-10-01T09:30:00Z");

function agent(
  key: string,
  building: string | null,
  role: RoleId,
  roleSource: RoleSource,
  laneStatus: LaneStatus,
  extra: Partial<AgentPlacement> = {},
): AgentPlacement {
  return {
    key,
    name: key.includes("/") ? key.slice(key.indexOf("/") + 1) : key,
    displayName: key.includes("/") ? key.slice(key.indexOf("/") + 1) : key,
    registered: !key.includes("/"),
    role,
    roleSource,
    building,
    room: null,
    presence: "real",
    workingIn: null,
    locationInferred: false,
    laneStatus,
    posture: laneStatus === "working" ? "focused" : laneStatus === "blocked" ? "raised-hand" : laneStatus === "unknown" ? "greyed" : "relaxed",
    caption: null,
    deskTicketKey: null,
    alerts: [],
    ...extra,
  };
}

function counts(backlog: number, planned: number, in_progress: number, review: number, done: number): Record<TicketStatus, number> {
  return { backlog, planned, in_progress, review, done };
}

function building(b: Pick<Building, "slug" | "key" | "name" | "color" | "icon" | "archived" | "counts" | "lead" | "agents">): Building {
  return { ...b, rooms: [], objects: [], milestones: [], releases: [], beacons: [], mailbox: [], archivedCount: 0 };
}

export function fixtureWorld(stale = FIXTURE_STALE): WorldModel {
  const lane = (status: LaneStatus): LaneStatus => (stale ? "unknown" : status);
  return {
    now: NOW,
    mode: "demo",
    cursor: 0,
    freshness: stale ? { teamTs: "2026-10-01T09:12:00Z", ageSeconds: 1080, stale: true } : { teamTs: "2026-10-01T09:29:40Z", ageSeconds: 20, stale: false },
    buildings: [
      building({
        slug: "crewhub",
        key: "CR",
        name: "CrewHub product",
        color: "coral",
        icon: "home",
        archived: false,
        counts: counts(6, 3, 2, 4, 18),
        lead: { id: "cr-lead", displayName: "cr-lead" },
        agents: [
          agent("cr-lead", "crewhub", "lead", "fact", lane("working")),
          agent("cr-lead-1/cr-dev-1", "crewhub", "worker", "name-rule", lane("working")),
          agent("cr-lead-1/cr-design-1", "crewhub", "design", "name-rule", lane("idle")),
          agent("cr-lead-1/scribe", "crewhub", "worker", "name-rule", lane("blocked")),
          agent("cl-lead-1/cl-dev-2", "crewhub", "worker", "name-rule", lane("working"), { presence: "proxy", workingIn: "loops", locationInferred: true }),
        ],
      }),
      building({
        slug: "loops",
        key: "CL",
        name: "crewhub-loops",
        color: "tangerine",
        icon: "bot",
        archived: false,
        counts: counts(3, 2, 4, 5, 52),
        lead: { id: "cl-lead", displayName: "cl-lead" },
        agents: [
          agent("cl-lead", "loops", "lead", "fact", lane("idle")),
          agent("cl-lead-1/cl-dev-2", "loops", "worker", "name-rule", lane("working"), { locationInferred: true }),
          agent("cl-lead-1/cl-dev-3", "loops", "worker", "name-rule", lane("working")),
          agent("cl-lead-1/cl-analyst-1", "loops", "analyst", "name-rule", lane("done")),
        ],
      }),
      building({
        slug: "marketing",
        key: "MK",
        name: "Autumn campaign",
        color: "circle",
        icon: "spark",
        archived: false,
        counts: counts(8, 1, 1, 0, 4),
        lead: { id: "maya", displayName: "Maya" },
        agents: [agent("maya", "marketing", "lead", "fact", lane("working")), agent("maya-1/mk-design-1", "marketing", "design", "name-rule", lane("idle"))],
      }),
      building({
        slug: "old-site",
        key: "OS",
        name: "Old website",
        color: "mist",
        icon: "folder",
        archived: true,
        counts: counts(0, 0, 0, 0, 31),
        lead: { id: "web-lead", displayName: "web-lead" },
        agents: [],
      }),
    ],
    townHall: [agent("analyst", null, "analyst", "name-rule", lane("idle")), agent("ux-lead", null, "lead", "name-rule", lane("idle"))],
    postOffice: [agent("postman", null, "worker", "override", lane("idle"))],
    deliveries: [],
  };
}

/**
 * A stand-in playback clock so the playback bar can be seen and used before the scripted source exists. It only
 * moves the position; the fixture world itself does not change. It ticks only while someone listens.
 */
export function fixturePlayback(durationMs = 12 * 60_000): PlaybackControls {
  let position = 0,
    speed: PlaybackSpeed = 1,
    loops = 0,
    last = 0,
    timer: ReturnType<typeof setInterval> | null = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const tick = () => {
    const now = performance.now();
    const dt = last ? now - last : 0;
    last = now;
    if (!speed) return;
    position += dt * speed;
    while (position >= durationMs) {
      position -= durationMs;
      loops += 1;
    }
    emit();
  };
  return {
    durationMs,
    positionMs: () => position,
    speed: () => speed,
    setSpeed(next) {
      speed = next;
      last = performance.now();
      emit();
    },
    seek(next) {
      position = Math.min(Math.max(next, 0), durationMs - 1);
      emit();
    },
    loop: () => loops,
    onChange(listener) {
      listeners.add(listener);
      if (!timer) {
        last = performance.now();
        timer = setInterval(tick, 250);
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size && timer) {
          clearInterval(timer);
          timer = null;
        }
      };
    },
  };
}

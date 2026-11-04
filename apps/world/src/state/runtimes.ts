/* The page's runtimes, each built once from the page's config (state/page.ts): the world (state/world.ts) on its
   source adapter, the town (state/town.ts) on its store, the director (state/director.ts). StrictMode's double mount and
   every hook share them. This module is the page's wiring: the browser's clock, storage, stores and buses go in here
   and nowhere else, so the runtimes themselves run in a node test. */
import { useEffect, useSyncExternalStore } from "react";
import { browserScheduler } from "@crewhub/demo";
import { readHostTown, writeHostTown, type ConnectionState, type ConnectionStatus } from "@crewhub/loops-client";
import { builtinIds } from "@crewhub/world-model";
import { definitions } from "../world/definitions";
import { clearIntents, playIntent } from "../world/intentPlayer";
import { NavWorld } from "../world/navigation";
import { carryAllocations } from "../world/settlement";
import { styleRegistry } from "../world/style";
import { buildingPlanNow } from "./buildingPlan";
import { subscribeOf } from "./connectionSubscribe";
import { createDirectorRuntime, type DirectorRuntime, type DirectorState } from "./director";
import { createHostTownStore, townStoreFor } from "./hostTown";
import { pageConfig } from "./page";
import { rememberSaid } from "./said";
import { takeFirstSnapshot } from "./source";
import { rememberThreads } from "./threads";
import { createTownRuntime, type TownRuntime, type TownState } from "./town";
import { hostConnected, hostTownChanged, onHostConnected, onHostTown } from "./townBus";
import { createTownStore, seededTown } from "./townStore";
import { browserFrameClock, createWorldRuntime, worldSources, type WorldRuntime, type WorldState } from "./world";

let world: WorldRuntime | null = null;
/** The page's world runtime. */
export function worldRuntime(): WorldRuntime {
  if (world) return world;
  const page = pageConfig();
  // The script starts at the minute the page opened, so the copied chat's relative times read naturally.
  const epochMs = Math.floor(Date.now() / 60_000) * 60_000;
  // Live: the first snapshot main.tsx read ahead, if it did: the first model has the town.
  const firstSnapshot = page.live ? takeFirstSnapshot() : undefined;
  const { source, chat } = worldSources(
    { live: page.live, scenarioId: page.scenario.id, stressSize: page.stressSize },
    { scheduler: browserScheduler(), epochMs, ...(firstSnapshot ? { firstSnapshot } : {}), onTown: hostTownChanged },
  );
  world = createWorldRuntime({
    source,
    chat,
    epochMs,
    clock: browserFrameClock(),
    buildingLimit: page.buildingLimit,
    outlets: { said: rememberSaid, threads: rememberThreads, hostConnected, firstSnapshot: () => performance.mark("world:snapshot") },
  });
  return world;
}

let town: TownRuntime | null = null;
/** The page's town runtime: its document kept in this browser, or by the host for a live installation (round 20). */
export function townRuntime(): TownRuntime {
  if (town) return town;
  const page = pageConfig();
  const context = { knownStyles: styleRegistry.listStyles().map((s) => s.id), builtinIds: builtinIds(definitions) };
  // A scenario's town starts with its zones' looks (Studio's four districts); the stress fixtures start empty.
  const initial = page.stress ? undefined : seededTown(page.scenario.townZones, context);
  // Lots are facts of the town, not edits: an undo or redo carries them into the revision it restores.
  const local = createTownStore({ context, name: page.townKey, carry: carryAllocations, ...(initial ? { initial } : {}), ...(page.townCopyFrom ? { copyFrom: page.townCopyFrom } : {}) });
  // Live: the world's host keeps the town for this installation (round 20); the browser's store is the fallback.
  const store = townStoreFor({
    live: page.live,
    local,
    make: (own) => createHostTownStore({ local: own, context, onTown: onHostTown, onConnected: onHostConnected, transport: { read: () => readHostTown(), write: (op, document, baseRev) => writeHostTown(document, baseRev, "", 15_000, op) }, log: (line) => console.info(`[town] ${line}`) }),
  });
  town = createTownRuntime({ world: worldRuntime(), context, store, buildingPlan: buildingPlanNow, newId: () => crypto.randomUUID() });
  return town;
}

let director: DirectorRuntime | null = null;
/** The page's director runtime: the scripted feed, its settings kept in this browser. */
export function directorRuntime(): DirectorRuntime {
  director ??= createDirectorRuntime({
    world: worldRuntime(),
    storage: () => globalThis.localStorage,
    intents: { play: playIntent, clear: clearIntents },
    nav: () => new NavWorld(),
    buildingPlan: buildingPlanNow,
  });
  return director;
}

export function useWorld(): WorldState {
  const world = worldRuntime();
  return useSyncExternalStore(world.subscribe, () => world.state);
}

/** The live source's connection state for the chip; null in demo mode. */
export function useConnection(): ConnectionState | null {
  const connection = worldRuntime().connection;
  return useSyncExternalStore(subscribeOf(connection), () => (connection ? connection.state() : null));
}

/** The host's own word on its key from the stream's last status (none, checking, rejected, ok…); null in demo mode or from a host that does not say. */
export function useConnectionKey(): ReturnType<ConnectionStatus["key"]> {
  const connection = worldRuntime().connection;
  return useSyncExternalStore(subscribeOf(connection), () => (connection ? connection.key() : null));
}

export function useTown(): TownState {
  const town = townRuntime();
  return useSyncExternalStore(town.subscribe, () => town.state);
}

/** Mount once near the root: starts the feed, which then runs whether or not a panel is open. */
export function useDirectorFeed(): void {
  useEffect(() => directorRuntime().start(), []);
}

export function useDirector(): DirectorState {
  const director = directorRuntime();
  return useSyncExternalStore(director.subscribe, () => director.state);
}

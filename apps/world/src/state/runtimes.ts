/* The page's runtimes, each built once from the page's config (state/page.ts): the world (state/world.ts) on its
   source adapter, the town (state/town.ts) on its store, the director (state/director.ts), the chat (state/chat.ts) on
   its demo or live adapter. StrictMode's double mount and
   every hook share them. This module is the page's wiring: the browser's clock, storage, stores and buses go in here
   and nowhere else, so the runtimes themselves run in a node test. */
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { browserScheduler } from "@crewhub/demo";
import { readHostTown, writeHostTown, type ConnectionState, type ConnectionStatus, type HostHealth } from "@crewhub/loops-client";
import { builtinIds } from "@crewhub/world-model";
import { definitions } from "../world/definitions";
import { clearIntents, playIntent } from "../world/intentPlayer";
import { NavWorld } from "../world/navigation";
import { carryAllocations } from "../world/settlement";
import { styleRegistry } from "../world/style";
import { setNavigator } from "../shims/react-router-dom";
import { buildingPlanNow } from "./buildingPlan";
import { demoChat, liveChat, opensSettings, type Chat, type RoadWord } from "./chat";
import type { ChatRoadView } from "./chatRoad";
import { chatRoadReader } from "./chatRoadStore";
import { createChatStores, type ThreadMap } from "./chatStores";
import { subscribeOf } from "./connectionSubscribe";
import { createDirectorRuntime, type DirectorRuntime, type DirectorState } from "./director";
import { getHealth, subscribeHealth } from "./health";
import { createHostTownStore, townStoreFor } from "./hostTown";
import { pageConfig } from "./page";
import { createPageChatRunner } from "./pageChat";
import type { Answer, SaidMap } from "./said";
import { takeFirstSnapshot } from "./source";
import { createTownRuntime, type TownRuntime, type TownState } from "./town";
import { hostConnected, hostTownChanged, onHostConnected, onHostTown } from "./townBus";
import { createTownStore, seededTown } from "./townStore";
import { browserFrameClock, createWorldRuntime, worldSources, type WorldRuntime, type WorldState } from "./world";

/** The page's chat stores, on the browser's clock and timers. */
export const chatStores = createChatStores({
  now: () => Date.now(),
  schedule: (fn, ms) => {
    const timer = setTimeout(fn, ms);
    return () => clearTimeout(timer);
  },
});
const chatRoad = chatRoadReader(chatStores, { get: getHealth, subscribe: subscribeHealth });

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
    outlets: { said: chatStores.said.remember, threads: chatStores.threads.remember, hostConnected, firstSnapshot: () => performance.mark("world:snapshot") },
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

let chat: Chat | null = null;
/** The page's chat: the demo's over the dock's demo source, or, on a live page (no dock), the live one's. */
export function chatRuntime(): Chat {
  if (chat) return chat;
  const world = worldRuntime();
  chat = world.chat === null ? liveChat({ world, road: pageRoad }) : demoChat({ world, dock: world.chat, said: chatStores.said.remember, storage: () => globalThis.localStorage });
  return chat;
}

/**
 * Road 2's page wiring (round 28, state/pageChat.ts): one runner for this word; its lines, its threads, its state and the
 * probe's verdict go to the chat stores (the road's words switch by themselves, r28-session); the page coming back into view and the online
 * event wake it (an ask now; the browser's online flag itself is not asked, design choice L2). Returns the stop.
 */
function pageRoad(word: RoadWord): () => void {
  const runner = createPageChatRunner({
    ...word,
    hidden: () => document.hidden,
    onLine: chatStores.said.remember,
    onThreads: chatStores.threads.remember,
    onState: (state) => {
      chatStores.page.publish(state);
      chatStores.probe.remember(state.probe);
    },
  });
  const visible = () => {
    if (!document.hidden) runner.wake();
  };
  const online = () => runner.wake();
  document.addEventListener("visibilitychange", visible);
  window.addEventListener("online", online);
  runner.start();
  return () => {
    document.removeEventListener("visibilitychange", visible);
    window.removeEventListener("online", online);
    runner.stop();
  };
}

/**
 * The page's chat, running while App is mounted: its producers refresh the copied chat's queries, it follows the host's
 * health and the lead of the building you are in, and the copied chat's `/settings` navigations open the Settings card.
 */
export function useChat(facts: { health: HostHealth | null; leadId: string | null; openSettings: () => void }): Chat {
  const qc = useQueryClient();
  const chat = chatRuntime();
  const { health, leadId, openSettings } = facts;
  useEffect(() => chat.start((key) => void qc.invalidateQueries({ queryKey: key })), [chat, qc]);
  useEffect(() => chat.follow({ health, leadId }), [chat, health, leadId]);
  useEffect(() => {
    setNavigator((to) => {
      if (opensSettings(to)) openSettings();
    });
    return () => setNavigator(null);
  }, [openSettings]);
  return chat;
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

/** The lines in flight, for the canvas (re-rendered when one arrives or goes). */
export function useSaid(): SaidMap {
  return useSyncExternalStore(chatStores.subscribe, chatStores.said.lines);
}

/** The Recent answers list: the last lines the page saw, newest first. */
export function useRecentAnswers(): readonly Answer[] {
  return useSyncExternalStore(chatStores.subscribe, chatStores.recent);
}

/** The threads as the host last sent them, or null when it sent none. */
export function useChatThreads(): ThreadMap | null {
  return useSyncExternalStore(chatStores.subscribe, chatStores.threads.get);
}

/** The chat road for this page, live: the health store and the probe's verdict. */
export function useChatRoad(): ChatRoadView {
  return useSyncExternalStore(chatRoad.subscribe, chatRoad.read);
}

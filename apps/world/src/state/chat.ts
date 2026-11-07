/* The page's chat (round 59d, C9): one interface over the two chats a page can have, each an adapter.
   - The demo's: the copied dock (components/bubbles) over the scripted demo source. Its api answers the dock's requests,
     its events and snapshots refresh the dock's queries, the lead of the building you are in is the dock's default head
     until the person pins, and an agent's reply is read back into the said store (round 17, state/demoSaid.ts) when
     the dock's demo is the world's own source (never the stress fixture's separate dock). An agent's chat is its card.
   - The live one's: crewhub-loops' own chat in the Chat panel (components/ChatPanel), and road 2 (round 28, the page's
     own read, state/pageChat.ts) restarted whenever the host's word changes (the loops origin it names, whether its key
     reads the chat). Road 1 (the host's `chat` and `threads` messages) is the world source's (state/world.ts outlets).
   App asks the chat where a bubble tap, a card's Chat button or an answer row goes, and never which mode it is in.
   Node-loadable: the page's wiring (the browser's storage, events and stores) is state/runtimes.ts `chatRuntime`. */
import { createDemoApi, type DemoApi, type DemoSource } from "@crewhub/demo";
import type { ChatLine, Envelope, HostHealth } from "@crewhub/loops-client";
import { agentCardFacts, type AgentPlacement, type WorldModel } from "@crewhub/world-model";
import type { QueryKey } from "@tanstack/react-query";
import { hostKeyReadsChatOf } from "./chatRoad.ts";
import { demoChatLine, isAgentDm } from "./demoSaid.ts";
import { loopsOriginOf } from "./pageChat.ts";
import { answerTarget, type AnswerTarget } from "./recentAnswers.ts";
import type { Answer } from "./said.ts";
import { agentNameOf } from "./view.ts";
import { storedValue } from "./setting.ts";
import type { WorldRuntime } from "./world.ts";

/** Where "open the chat for this agent" goes: the agent's card (the demo: its chat is the dock), or the Chat panel (live; null: opened from the chip, no agent). */
export type ChatOpening = { card: string | null } | { panel: { key: string; name: string } | null };

/** What the page tells the chat as it changes: the host's health (live: road 2) and the lead of the building you are in (the demo: the dock's default head). */
export interface ChatFollow {
  health: HostHealth | null;
  leadId: string | null;
}

export interface Chat {
  /** Where a bubble tap, a card's Chat button, an answer row or the chip (null) opens the chat for an agent. Safe to pass unbound. */
  readonly open: (agent: string | null) => ChatOpening;
  /** Where an answer row goes, in words: the agent, the row's action and its note. Safe to pass unbound. */
  readonly answerTarget: (answer: Pick<Answer, "agentId" | "agentName">) => AnswerTarget;
  /** Whether the chat has a panel of its own: a card then shows a Chat button. */
  readonly panel: boolean;
  /** The copied dock's api (api/client sends every request of the dock here); null in live, where there is no dock. */
  readonly api: DemoApi | null;
  /** Runs the chat's producers until the returned stop; `invalidate` refreshes one of the copied chat's queries. */
  start(invalidate: (key: QueryKey) => void): () => void;
  /** The page's facts, each time they may have changed; the chat acts only on what changed. */
  follow(facts: ChatFollow): void;
}

/** What the chat reads of the world: the model (names, placements), the projection's facts (the card's), its source. */
export type ChatWorld = Pick<WorldRuntime, "state" | "source" | "projection">;

/** Every figure of the model: in a building, the town hall or the post office. */
const figures = (model: WorldModel): AgentPlacement[] => [...model.buildings.flatMap((b) => b.agents), ...model.townHall, ...model.postOffice];

/** The figure an answer names, by its id or its key, anywhere in the model. */
function placementOf(model: WorldModel, agentId: string): AgentPlacement | null {
  return figures(model).find((a) => a.name === agentId || a.key === agentId) ?? null;
}

/* The copied chat's query keys a demo event or snapshot refreshes (loops `state/events.tsx` `invalidationsFor`, the
   chat part), and the pins' key (components/bubbles/queries.ts `dmKeys.pins`, a verbatim copy this module cannot load). */
const DM_KEYS: QueryKey[] = [["dm-messages"], ["dm-threads"]];
const SNAPSHOT_KEYS: QueryKey[] = [["dm-threads"], ["dm-messages"], ["dm-summary"], ["agents"]];
// Kept here, not imported: queries.ts would close the cycle chat → queries → api/client → runtimes → chat, and it does
// not load in node. A test reads queries.ts's text and holds the two equal (test/chat.test.ts).
export const PINS_QUERY_KEY: QueryKey = ["bubbles-pins"];
/** The person's pins, kept so a reload keeps them (loops keeps them on the server; the demo has none). */
export const PINS_KEY = "crewhub.world.bubbles.pins";
/* Summary links point at loops' ticket pages (`/t/<KEY>`); the demo has no loops app, so they stay on this page. */
const DEMO_LOOPS_URL = "#loops";

/** A DM event, or a delivery naming a DM thread, refreshes the messages and the threads; a snapshot (a seek, a new loop) everything the dock shows. */
function refreshed(message: { type: "snapshot" } | { type: "event"; envelope: Pick<Envelope, "type" | "payload"> }): QueryKey[] {
  if (message.type === "snapshot") return SNAPSHOT_KEYS;
  const e = message.envelope;
  return e.type.startsWith("dm.") || typeof e.payload["dmThreadId"] === "string" ? DM_KEYS : [];
}

type PinStorage = Pick<Storage, "getItem" | "setItem">;

const storedPins = storedValue<string[] | null>({
  key: PINS_KEY,
  parse: (text) => {
    const value: unknown = text === null ? null : JSON.parse(text);
    return Array.isArray(value) && value.every((id) => typeof id === "string") ? value : null;
  },
  format: (pins) => (pins === null ? null : JSON.stringify(pins)),
});

export interface DemoChatConfig {
  world: ChatWorld;
  /** The dock's demo source: the world's own, or (the stress fixture) a separate scripted demo for the dock only. */
  dock: DemoSource;
  /** The said store's writer: the read-back reply goes there. */
  said: (line: ChatLine) => void;
  /** Where the person's pins are kept; null or a storage that throws keeps them for this page only. */
  storage: () => PinStorage | null;
}

/** The demo's chat: the copied dock over the scripted demo. */
export function demoChat(config: DemoChatConfig): Chat {
  const { world, dock, said } = config;
  let api: DemoApi | null = null;
  const dockApi = () => (api ??= createDemoApi(dock, { pins: storedPins.read(config.storage), onPinsChange: (pins) => storedPins.write(pins, config.storage), baseUrl: DEMO_LOOPS_URL }));
  let invalidate: ((key: QueryKey) => void) | null = null;
  let lead: string | null | undefined;
  /* The agent's reply, read back from the demo's thread: the line the said store keeps, named as the model names the agent now. */
  const readBack = (envelope: Pick<Envelope, "type" | "actor" | "payload"> & { payload: { agentId: string } }) => {
    const { agentId } = envelope.payload;
    void dock.getDmMessages(agentId).then((messages) => {
      const name = figures(world.state.model).find((a) => a.name === agentId)?.displayName ?? null;
      const line = demoChatLine(envelope, messages, name);
      if (line !== null) said(line);
    });
  };
  return {
    open: (agent) => ({ card: agent }),
    answerTarget: (answer) => {
      const placed = placementOf(world.state.model, answer.agentId);
      const name = placed?.displayName ?? answer.agentName ?? answer.agentId;
      return { agent: { key: placed?.key ?? answer.agentId, name }, action: `Open ${name}'s card`, note: null };
    },
    panel: false,
    get api() {
      return dockApi();
    },
    start(sink) {
      invalidate = sink;
      const stop = dock.start((message) => {
        if (message.type !== "snapshot" && message.type !== "event") return;
        for (const key of refreshed(message)) sink(key);
        if (message.type === "event" && world.source === dock && isAgentDm(message.envelope)) readBack(message.envelope);
      });
      return () => {
        stop();
        if (invalidate === sink) invalidate = null;
      };
    },
    follow({ leadId }) {
      if (leadId === lead) return;
      lead = leadId;
      dockApi().setView({ leadId });
      invalidate?.(PINS_QUERY_KEY);
    },
  };
}

/** The host's word road 2 follows: the loops origin the page asks, and whether the host's key reads the chat. */
export interface RoadWord {
  loopsOrigin: string;
  hostKeyReadsChat: boolean | null;
}

export interface LiveChatConfig {
  world: ChatWorld;
  /** Starts road 2 for this word and returns its stop (the page's wiring: state/runtimes.ts). */
  road: (word: RoadWord) => () => void;
}

/** The live page's chat: crewhub-loops' own chat in the Chat panel, and road 2 restarted when the host's word changes. */
export function liveChat(config: LiveChatConfig): Chat {
  const { world, road } = config;
  let word: { origin: string | null; key: boolean | null } | null = null;
  let running = false;
  let stop: (() => void) | null = null;
  const restart = () => {
    stop?.();
    stop = null;
    if (running && word !== null && word.origin !== null) stop = road({ loopsOrigin: word.origin, hostKeyReadsChat: word.key });
  };
  return {
    open: (agent) => ({ panel: agent === null ? null : { key: agent, name: agentNameOf(world.state.model, agent) } }),
    answerTarget: (answer) => {
      const model = world.state.model;
      const placed = placementOf(model, answer.agentId);
      return answerTarget(answer, placed ? agentCardFacts(model, world.projection.facts, placed.key) : null);
    },
    panel: true,
    api: null,
    start() {
      running = true;
      restart();
      return () => {
        running = false;
        restart();
      };
    },
    follow({ health }) {
      const next = { origin: loopsOriginOf(health), key: hostKeyReadsChatOf(health) };
      if (word !== null && next.origin === word.origin && next.key === word.key) return;
      word = next;
      restart();
    },
  };
}

/** `/settings/...` opens the world's Settings card; there is nothing else for the copied chat's navigations to open. */
export function opensSettings(to: string): boolean {
  return to.startsWith("/settings");
}

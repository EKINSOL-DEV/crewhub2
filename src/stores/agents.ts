// Agents store (T19, EKI-32): CRUD over the agent IPC, reconciled on
// DomainEvent::Agent*. `create` takes the NewAgent core plus the extras the
// create command does not accept (persona, pin, auto-spawn) and applies them
// with a follow-up update — one logical "hire" from the UI's point of view.
import { create } from "zustand";
import { commands, type Agent, type NewAgent } from "@/ipc/bindings";
import { onDomainEvent } from "@/ipc/events";

export interface AgentExtras {
  persona_json?: string | null;
  is_pinned?: boolean;
  auto_spawn?: boolean;
  bio?: string | null;
}

export type AgentResult = { status: "ok"; data: Agent } | { status: "error"; error: string };

interface AgentsState {
  agents: Agent[];
  loaded: boolean;
  init: () => Promise<void>;
  refresh: () => Promise<void>;
  create: (input: NewAgent, extras?: AgentExtras) => Promise<AgentResult>;
  update: (agent: Agent) => Promise<AgentResult>;
  remove: (id: string) => Promise<string | null>;
  reset: () => void;
}

let started = false;

export const useAgentsStore = create<AgentsState>((set, get) => ({
  agents: [],
  loaded: false,
  refresh: async () => {
    try {
      const res = await commands.listAgents();
      // Array.isArray also guards loosely-mocked IPC (null data) in tests.
      if (res.status === "ok" && Array.isArray(res.data)) set({ agents: res.data });
      set({ loaded: true });
    } catch {
      set({ loaded: true }); // backend unavailable (unit tests)
    }
  },
  init: async () => {
    if (started) return;
    started = true;
    await get().refresh();
    try {
      await onDomainEvent((e) => {
        if (e.type === "AgentCreated" || e.type === "AgentUpdated" || e.type === "AgentDeleted") {
          void get().refresh();
        }
      });
    } catch {
      // event bridge unavailable (unit tests)
    }
  },
  create: async (input, extras) => {
    try {
      const res = await commands.createAgent(input);
      if (res.status === "error") return res;
      let agent = res.data;
      if (extras && Object.keys(extras).length > 0) {
        const updated = await commands.updateAgent({ ...agent, ...extras });
        if (updated.status === "error") return updated;
        agent = updated.data;
      }
      await get().refresh();
      return { status: "ok", data: agent };
    } catch (e) {
      return { status: "error", error: String(e) };
    }
  },
  update: async (agent) => {
    try {
      const res = await commands.updateAgent(agent);
      if (res.status === "ok") await get().refresh();
      return res;
    } catch (e) {
      return { status: "error", error: String(e) };
    }
  },
  remove: async (id) => {
    try {
      const res = await commands.deleteAgent(id);
      if (res.status === "error") return res.error;
      await get().refresh();
      return null;
    } catch (e) {
      return String(e);
    }
  },
  reset: () => {
    started = false;
    set({ agents: [], loaded: false });
  },
}));

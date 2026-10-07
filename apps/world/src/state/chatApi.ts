/* The demo chat API of this page: packages/demo `createDemoApi` over the world's one demo source. The person's pins are
   kept in localStorage, so a reload keeps them (loops keeps them on the server; the demo has none). */
import { createDemoApi, type DemoApi } from "@crewhub/demo";
import { worldRuntime } from "./world";

const PINS_KEY = "crewhub.world.bubbles.pins";
/* Summary links point at loops' ticket pages (`/t/<KEY>`); the demo has no loops app, so they stay on this page. */
const DEMO_LOOPS_URL = "#loops";

function savedPins(): string[] | null {
  try {
    const raw = localStorage.getItem(PINS_KEY);
    const value: unknown = raw === null ? null : JSON.parse(raw);
    return Array.isArray(value) && value.every((id) => typeof id === "string") ? value : null;
  } catch {
    return null;
  }
}

function savePins(pins: string[]): void {
  try {
    localStorage.setItem(PINS_KEY, JSON.stringify(pins));
  } catch {
    // Storage off (a private window): the pins last until the page closes.
  }
}

let chatApi: DemoApi | null = null;

export function demoChatApi(): DemoApi {
  const chat = worldRuntime().chat;
  if (!chat) throw new Error("The demo chat API has no demo source in live mode (the chat is phase 2).");
  chatApi ??= createDemoApi(chat, { pins: savedPins(), onPinsChange: savePins, baseUrl: DEMO_LOOPS_URL });
  return chatApi;
}

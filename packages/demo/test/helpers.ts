/** Plays the demo with a manual scheduler and records every message it sends. */
import type { Envelope, SourceMessage } from "@crewhub/loops-client";
import { SCRIPT_DURATION_MS } from "../src/script.ts";
import { type DemoSource, createDemoSource } from "../src/source.ts";
import { type ManualScheduler, createManualScheduler } from "../src/scheduler.ts";

export interface Run {
  source: DemoSource;
  scheduler: ManualScheduler;
  messages: SourceMessage[];
  /** Plays `demoMs` of demo time at the current speed. */
  play(demoMs: number): void;
}

export function startDemo(options: { seed?: number; speed?: 1 | 4 | 16; startAt?: number } = {}): Run {
  const scheduler = createManualScheduler(1_000);
  const speed = options.speed ?? 16;
  const source = createDemoSource({
    scheduler,
    speed,
    ...(options.seed === undefined ? {} : { seed: options.seed }),
    ...(options.startAt === undefined ? {} : { startAt: options.startAt }),
  });
  const messages: SourceMessage[] = [];
  source.start((message) => messages.push(message));
  return {
    source,
    scheduler,
    messages,
    play(demoMs) {
      scheduler.advance(Math.ceil(demoMs / speed));
    },
  };
}

/** One full loop and a little of the next, so the loop boundary is included. */
export function playLoop(options: { seed?: number; speed?: 1 | 4 | 16 } = {}): Run {
  const run = startDemo(options);
  run.play(SCRIPT_DURATION_MS + 20_000);
  return run;
}

export function envelopes(messages: SourceMessage[]): Envelope[] {
  return messages.flatMap((m) => (m.type === "event" ? [m.envelope] : []));
}

/** The envelopes of the first loop (before the second snapshot). */
export function firstLoop(messages: SourceMessage[]): SourceMessage[] {
  const second = messages.findIndex((m, index) => index > 0 && m.type === "snapshot");
  return second === -1 ? messages : messages.slice(0, second);
}

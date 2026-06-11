// `?perf` probe (D-M2-4 budget enforcement): mounts a 5k-item synthetic
// transcript, auto-scrolls it, and reports frame-time percentiles on
// `window.__CREWHUB_PERF__` + in the DOM (`data-testid="perf-result"`).
// Mounted behind the `?perf` query in the shell entry (src/App.tsx).
import { useEffect, useRef, useState } from "react";
import type { SessionId } from "@/ipc/bindings";
import { useTranscripts } from "@/stores/transcripts";
import { VirtualTranscript } from "../VirtualTranscript";
import { makePerfFixture } from "./fixture";

export interface PerfResult {
  frames: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  approxFps: number;
}

declare global {
  interface Window {
    __CREWHUB_PERF__?: PerfResult;
  }
}

const PERF_SID: SessionId = { provider: "perf", id: "perf-fixture-0000" };
const SCROLL_PX_PER_SEC = 4000; // a fast wheel/trackpad fling
const WARMUP_FRAMES = 30;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx] as number;
}

export function summarizeFrames(deltas: number[]): PerfResult {
  const samples = deltas.slice(WARMUP_FRAMES);
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = samples.reduce((a, b) => a + b, 0);
  const avg = samples.length > 0 ? sum / samples.length : 0;
  return {
    frames: samples.length,
    avgMs: Math.round(avg * 100) / 100,
    p50Ms: Math.round(percentile(sorted, 50) * 100) / 100,
    p95Ms: Math.round(percentile(sorted, 95) * 100) / 100,
    maxMs: Math.round(percentile(sorted, 100) * 100) / 100,
    approxFps: avg > 0 ? Math.round(1000 / avg) : 0,
  };
}

function runScrollProbe(el: HTMLElement, durationMs: number): Promise<PerfResult> {
  return new Promise((resolve) => {
    const deltas: number[] = [];
    const start = performance.now();
    let last = start;
    let dir: 1 | -1 = -1;
    el.scrollTop = el.scrollHeight;
    const step = (now: number) => {
      const dt = now - last;
      deltas.push(dt);
      last = now;
      el.scrollTop += (dir * (SCROLL_PX_PER_SEC * dt)) / 1000;
      if (el.scrollTop <= 1) dir = 1;
      else if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) dir = -1;
      if (now - start >= durationMs) resolve(summarizeFrames(deltas));
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

export function PerfProbe({
  count = 5000,
  durationMs = 8000,
  autorun = true,
}: {
  count?: number;
  durationMs?: number;
  autorun?: boolean;
}) {
  // Lazy initializer: the fixture lands in the store before the transcript
  // mounts, without an effect-driven second render.
  const [ready] = useState(() => {
    useTranscripts.getState().reset(PERF_SID);
    useTranscripts.getState().ingestPage(PERF_SID, makePerfFixture(count));
    return true;
  });
  const [result, setResult] = useState<PerfResult | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (!ready || !autorun || ran.current) return;
    ran.current = true;
    const el = document.querySelector<HTMLElement>('[data-testid="virtual-transcript"]');
    if (!el) return;
    void runScrollProbe(el, durationMs).then((r) => {
      window.__CREWHUB_PERF__ = r;
      setResult(r);
      const report = new URLSearchParams(window.location.search).get("perfReport");
      if (report) {
        void fetch(report, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(r),
        }).catch(() => {});
      }
    });
  }, [ready, autorun, durationMs]);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <div className="border-b border-border px-3 py-2 font-mono text-xs" data-testid="perf-result">
        {result
          ? `5k probe — p50 ${result.p50Ms}ms · p95 ${result.p95Ms}ms · max ${result.maxMs}ms · ~${result.approxFps}fps over ${result.frames} frames ${result.p95Ms < 16.7 ? "✅" : "❌"}`
          : `scrolling ${count.toLocaleString()} items…`}
      </div>
      <div className="min-h-0 flex-1">{ready && <VirtualTranscript sid={PERF_SID} />}</div>
    </div>
  );
}

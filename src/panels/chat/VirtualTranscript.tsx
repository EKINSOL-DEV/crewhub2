// Virtualized transcript (D-M2-4): TanStack Virtual + measureElement for
// dynamic markdown heights, stick-to-bottom while pinned, "⬇ new stuff" pill
// otherwise, prepend-without-jump when older pages arrive on scroll-up.
// `anchorSeq` (activity/history click-through) loads the page containing that
// seq, scrolls to the row and pulses it briefly (reduced-motion-aware).
import "./chat.css";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { EmptyState } from "@/components/EmptyState";
import { usePrefersReducedMotion } from "@/components/use-reduced-motion";
import type { SessionId } from "@/ipc/bindings";
import { sessionKey, useTranscripts } from "@/stores/transcripts";
import { EntryRenderer } from "./EntryRenderer";
import { buildRenderList, interleaveSubagents, type SubagentGroup } from "./render-list";

const PIN_THRESHOLD_PX = 80;
const LOAD_OLDER_THRESHOLD_PX = 120;
const ANCHOR_PULSE_MS = 1600;

export function VirtualTranscript({
  sid,
  groups,
  anchorSeq,
}: {
  sid: SessionId;
  /** Child-session groups, interleaved by timestamp (D-M2-5). */
  groups?: SubagentGroup[];
  /** Transcript seq to scroll to and highlight on mount (SEAM 2). */
  anchorSeq?: number;
}) {
  const key = sessionKey(sid);
  const t = useTranscripts((s) => s.sessions[key]);
  const loadOlder = useTranscripts((s) => s.loadOlder);
  const reducedMotion = usePrefersReducedMotion();

  const entries = useMemo(() => {
    if (!t) return [];
    return interleaveSubagents(buildRenderList(t.items, t.order), groups ?? []);
  }, [t, groups]);

  const parentRef = useRef<HTMLDivElement | null>(null);
  const pinnedRef = useRef(anchorSeq === undefined);
  const [unread, setUnread] = useState(false);

  // seq-anchor: page the target seq into the buffer, then scroll + pulse once.
  const [anchorKey, setAnchorKey] = useState<string | null>(null);
  const anchorPendingRef = useRef(false);
  const anchorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (anchorSeq === undefined) return;
    anchorPendingRef.current = true;
    pinnedRef.current = false; // anchoring beats stick-to-bottom
    void useTranscripts.getState().ensureSeq(sid, anchorSeq);
  }, [sid, anchorSeq]);

  useEffect(
    () => () => {
      if (anchorTimerRef.current) clearTimeout(anchorTimerRef.current);
    },
    [],
  );

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 10,
    getItemKey: (i) => (entries[i] as { key: string }).key,
    initialRect: { width: 800, height: 600 },
  });

  // Once the page containing the anchor seq landed (or nothing older exists),
  // scroll to the row and pulse it briefly.
  const lowestLoaded = t?.order[0];
  useEffect(() => {
    if (!anchorPendingRef.current || anchorSeq === undefined) return;
    if (lowestLoaded === undefined || lowestLoaded > anchorSeq) return;
    const idx = entries.findIndex((e) => e.type !== "subagent" && e.seq >= anchorSeq);
    if (idx < 0) return;
    anchorPendingRef.current = false;
    virtualizer.scrollToIndex(idx, { align: "center" });
    setAnchorKey((entries[idx] as { key: string }).key);
    anchorTimerRef.current = setTimeout(() => setAnchorKey(null), ANCHOR_PULSE_MS);
  }, [entries, anchorSeq, lowestLoaded, virtualizer]);

  // Stick-to-bottom: pin while the user is near the bottom; otherwise show
  // the pill instead of yanking the scroll position (D-M2-4).
  const lastKey = entries.length > 0 ? (entries[entries.length - 1] as { key: string }).key : null;
  const countRef = useRef(entries.length);
  useEffect(() => {
    const grew = entries.length > countRef.current;
    countRef.current = entries.length;
    if (lastKey === null) return;
    if (pinnedRef.current) {
      virtualizer.scrollToIndex(entries.length - 1, { align: "end" });
    } else if (grew) {
      setUnread(true);
    }
  }, [lastKey, entries.length, virtualizer]);

  // Prepend-without-jump: when an older page lands, the previous first entry
  // shifts down by the height of the prepended block — compensate scrollTop.
  const firstKey = entries.length > 0 ? (entries[0] as { key: string }).key : null;
  const prevFirstKeyRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    const prev = prevFirstKeyRef.current;
    prevFirstKeyRef.current = firstKey;
    if (prev === null || firstKey === null || prev === firstKey || pinnedRef.current) return;
    const idx = entries.findIndex((e) => e.key === prev);
    if (idx <= 0) return;
    const offset = virtualizer.getOffsetForIndex(idx, "start")?.[0] ?? 0;
    const el = parentRef.current;
    if (el && offset > 0) el.scrollTop += offset;
  }, [firstKey, entries, virtualizer]);

  const onScroll = () => {
    const el = parentRef.current;
    if (!el) return;
    const bottomGap = el.scrollHeight - el.scrollTop - el.clientHeight;
    pinnedRef.current = bottomGap < PIN_THRESHOLD_PX;
    if (pinnedRef.current) setUnread(false);
    if (el.scrollTop < LOAD_OLDER_THRESHOLD_PX && t && !t.loadingOlder && (t.order[0] ?? 0) > 0) {
      void loadOlder(sid);
    }
  };

  const jumpToLatest = () => {
    pinnedRef.current = true;
    setUnread(false);
    if (entries.length > 0) virtualizer.scrollToIndex(entries.length - 1, { align: "end" });
  };

  if (t?.opened && entries.length === 0) {
    return <EmptyState emoji="💤" title="Nobody's talking yet" hint="Summon a crew member" />;
  }

  return (
    <div className="relative h-full">
      <div
        ref={parentRef}
        data-testid="virtual-transcript"
        className="h-full overflow-y-auto"
        onScroll={onScroll}
      >
        {t?.loadingOlder && (
          <div className="py-1 text-center text-xs text-muted-foreground" data-testid="loading-older">
            ⏳ fetching the past…
          </div>
        )}
        <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const entry = entries[vi.index];
            if (!entry) return null;
            const anchored = anchorKey !== null && entry.key === anchorKey;
            return (
              <div
                key={vi.key}
                data-index={vi.index}
                ref={virtualizer.measureElement}
                {...(anchored ? { "data-testid": "anchored-row" } : {})}
                className={anchored ? `ch-anchor${reducedMotion ? "" : " ch-anchor--pulse"}` : undefined}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${vi.start}px)`,
                }}
              >
                <EntryRenderer entry={entry} />
              </div>
            );
          })}
        </div>
      </div>
      {unread && (
        <button
          type="button"
          data-testid="new-stuff-pill"
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-border bg-card px-3 py-1 text-xs shadow-sm hover:bg-accent/20"
          onClick={jumpToLatest}
        >
          ⬇ new stuff
        </button>
      )}
    </div>
  );
}

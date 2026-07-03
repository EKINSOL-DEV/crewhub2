// Chat session hook (M2 T3): projects one open chat's transcript + live
// status into what `ChatWindow` renders, plus a `send`.
//
// Optimistic echo (live-feedback fix): a live send used to sit invisible
// until the engine's own `UserText` line landed in the transcript (~100ms,
// see stores/transcripts.ts) — a send() success now also drops an
// echo-flagged local "user" line (store.ts's addLocalLine) immediately, and
// `lines` below dedupes it the moment the real transcript line for the same
// text arrives. One transcript UserText line ever consumes one echo, so two
// identical sends need two separate transcript lines before both echoes
// clear — see the dedupe loop in the `lines` useMemo.
//
// M7 T3 ("say the word" chat wiring): `send` now intercepts a typed message
// BEFORE it ever reaches a real session. A deterministic command
// (parseIntent — "go to hq", "dance", …) always short-circuits to the sim,
// regardless of whether there's a live session behind the bot: the world
// reacts, the chat gets a local note + a speech bubble, and nothing is sent
// to the engine. Only prose that isn't a recognized command falls through to
// the old sendToSession path — and only when there IS a live session. A
// session-less bot (demo, or a resting/Ended crew member with no live
// session) instead asks the cheap Haiku fallback (interpretIntent) what the
// user meant — demo bots included: interpretIntent still reaches the real
// backend in demo mode, and degrades to the same "scratches head" note as
// everyone else when it can't (see the `isLive` check below).
import { useEffect, useMemo, useRef } from "react";
import {
  commands,
  type Agent,
  type PermissionRequest,
  type Project,
  type QuestionRequest,
  type SessionId,
  type SessionStatus,
} from "@/ipc/bindings";
import { playSfx } from "@/game/audio/sfx";
import type { CampusEdits } from "@/game/build/edits";
import { useCampusEdits } from "@/game/build/store";
import {
  parseIntent,
  type EmoteName,
  type Intent,
  type IntentContext,
  type IntentTarget,
} from "@/game/intents/parse";
import { interpretIntent } from "@/game/intents/interpret";
import { postCommand } from "@/game/sim/command-bus";
import { nearestEdgeDoor } from "@/game/world/campus/buildings";
import { campusLayout } from "@/game/world/campus/layout";
import { useProjectsStore } from "@/stores/projects";
import { useSessionsView } from "@/stores/sessions";
import { startTranscriptStream, useTranscripts } from "@/stores/transcripts";
import { chatLinesFrom, normalize, type ChatLine } from "./lines";
import { pushLocalBubble } from "./use-speech-bubbles";
import { useGameChats } from "./store";

/**
 * "provider:id" -> SessionId, splitting on the FIRST colon only (ids may
 * themselves contain ":"). Deliberately independent of the identical helper
 * in stores/transcripts.ts — this hook's tests mock that module wholesale,
 * so parsing stays correct even when the store is a stub.
 */
export function parseSessionKey(key: string): SessionId {
  const sep = key.indexOf(":");
  return { provider: key.slice(0, sep), id: key.slice(sep + 1) };
}

export interface ChatSessionPending {
  permissions: PermissionRequest[];
  questions: QuestionRequest[];
}

export type ChatSendResult = { ok: true } | { ok: false; error: string };

export interface ChatSessionResult {
  lines: ChatLine[];
  status: SessionStatus | undefined;
  /** The session's bound crew agent, or null if it has none (or isn't tracked). */
  agent: Agent | null;
  pending: ChatSessionPending;
  send: (text: string) => Promise<ChatSendResult>;
}

/** `demo:*` keys are fake robots (see sim/demo.ts) — there is no session behind them. */
function isDemoKey(key: string): boolean {
  return key.startsWith("demo:");
}

const EMPTY_LOCAL_LINES: ChatLine[] = [];

/** A linked room, ready for both IntentContext (name matching) and goto
 *  target resolution (door point) — see `linkedRoomsFromCampus`. */
export interface RoomTarget {
  buildingKey: string;
  name: string;
  door: { x: number; z: number };
}

/**
 * Every project-linked room on the campus right now, joined the same way
 * use-sim.ts's `withProjectGroupKeys` joins them for the sim — but as a
 * selector the chat layer can call directly, since it lives outside <Canvas>
 * and has no access to that hook's internals. `buildingKey` mirrors the sim
 * boundary's convention: "plot:N" for one of the four seeded pavilions,
 * the player-built pavilion's own id for a placed one (its `Building` loses
 * that id once merged by applyEdits(), so this reads straight off
 * `edits.buildings` instead of going through that merge).
 */
export function linkedRoomsFromCampus(edits: CampusEdits, projects: Project[]): RoomTarget[] {
  const nameOf = (projectId: string): string | undefined => projects.find((p) => p.id === projectId)?.name;
  const { plots } = campusLayout();

  const plotRooms: RoomTarget[] = [];
  for (const [plotIndexKey, projectId] of Object.entries(edits.plotProjects)) {
    const plotIndex = Number(plotIndexKey);
    const rect = plots[plotIndex];
    const name = rect ? nameOf(projectId) : undefined;
    if (rect && name) plotRooms.push({ buildingKey: `plot:${plotIndex}`, name, door: nearestEdgeDoor(rect) });
  }

  const placedRooms: RoomTarget[] = [];
  for (const b of edits.buildings) {
    const name = b.projectId ? nameOf(b.projectId) : undefined;
    if (name) {
      placedRooms.push({
        buildingKey: b.id,
        name,
        door: nearestEdgeDoor({ x: b.x, z: b.z, w: b.w, d: b.d }),
      });
    }
  }

  return [...plotRooms, ...placedRooms];
}

/**
 * Plaza ring point outside HQ's walls (M7 T3): a fixed south-side spot
 * rather than sim.ts's per-bot-hashed `outsideRingPoint` — chat commands
 * don't need every bot fanned out around the ring, just "outside, in the
 * open". 12 mirrors sim.ts's (unexported) OUTSIDE_RING_RADIUS constant (M9 polish: HQ grew, ring moved out),
 * which clears HQ's farthest corner on every approach angle; kept as its own
 * literal here rather than importing a private constant across that module
 * boundary.
 */
const PLAZA_POINT = { x: 0, z: 12 };

/** HQ's interior — dead center, well clear of its walls either way. */
const HQ_POINT = { x: 0, z: 0 };

function gotoPoint(target: IntentTarget, rooms: RoomTarget[]): { x: number; z: number } {
  if (target.type === "hq") return HQ_POINT;
  if (target.type === "plaza") return PLAZA_POINT;
  return rooms.find((r) => r.buildingKey === target.buildingKey)?.door ?? PLAZA_POINT;
}

function targetLabel(target: IntentTarget, rooms: RoomTarget[]): string {
  if (target.type === "hq") return "HQ";
  if (target.type === "plaza") return "the plaza";
  return rooms.find((r) => r.buildingKey === target.buildingKey)?.name ?? "the room";
}

const EMOTE_EMOJI: Record<EmoteName, string> = { dance: "💃", spin: "🌀", cheer: "🎉", wave: "👋" };

/** No real agent behind a session-less bot to ask further — the same shrug,
 *  whether the parser+interpreter both missed or the interpreter itself
 *  silently failed (interpretIntent never throws; see interpret.ts). */
const SCRATCHES_HEAD_NOTE = "🤖 …scratches head…";

/**
 * A recognized command's world-facing half: post it to the sim (via the
 * command bus, since the sim lives outside this component tree) and leave a
 * trace in the chat — a local note line plus a matching speech bubble. Used
 * for both a direct parseIntent hit and interpretIntent's goto/emote replies
 * (they're handled identically once "there's an Intent" is known).
 */
function applyGotoOrEmote(
  key: string,
  intent: Extract<Intent, { kind: "goto" | "emote" }>,
  rooms: RoomTarget[],
): void {
  if (intent.kind === "goto") {
    const point = gotoPoint(intent.target, rooms);
    postCommand(key, { kind: "goto", ...point });
    useGameChats.getState().addLocalLine(key, "note", `🏃 heading to ${targetLabel(intent.target, rooms)}`);
    pushLocalBubble(key, "On my way! 🏃");
  } else {
    postCommand(key, { kind: "emote", emote: intent.emote });
    useGameChats.getState().addLocalLine(key, "note", `${EMOTE_EMOJI[intent.emote]} ${intent.emote}`);
    pushLocalBubble(key, EMOTE_EMOJI[intent.emote]);
  }
  playSfx("send");
}

export function useChatSession(key: string): ChatSessionResult {
  const sid = useMemo(() => parseSessionKey(key), [key]);

  useEffect(() => {
    if (isDemoKey(key)) return;
    startTranscriptStream();
    void useTranscripts.getState().openSession(sid);
  }, [key, sid]);

  const transcript = useTranscripts((s) => s.sessions[key]);

  // Fresh-spawn race (reported live): the open-time probe can run before the
  // CLI has written the first transcript line, and the watcher tails from the
  // file's end — so the spawn prompt (seq 0) never arrives as a live event.
  // Self-heal: whenever the lowest loaded seq is above 0, page the gap in
  // from disk. `loadOlder` already no-ops while a fetch is in flight; the ref
  // stops us re-requesting the same lowest seq when the file genuinely
  // starts above 0 (truncated transcript).
  const lowest = transcript?.order[0];
  const backfillAttempted = useRef<number | null>(null);
  useEffect(() => {
    if (isDemoKey(key) || lowest === undefined || lowest === 0) return;
    if (backfillAttempted.current === lowest) return;
    backfillAttempted.current = lowest;
    void useTranscripts.getState().loadOlder(sid);
  }, [key, sid, lowest]);
  const view = useSessionsView().find((v) => v.key === key);
  const status = view?.meta.status;
  const agent = view?.agent ?? null;

  const localLines = useGameChats((s) => s.localLines[key] ?? EMPTY_LOCAL_LINES);
  const lines = useMemo(() => {
    const transcriptLines = chatLinesFrom(transcript?.items ?? new Map(), transcript?.order ?? []);
    // Echo dedupe: walk the transcript's own UserText lines (already
    // normalized by chatLinesFrom) and match each one against the first
    // not-yet-consumed echo-flagged local line with the same normalized
    // text — first-match, one-for-one, so N identical sends need N
    // transcript echoes before every local echo disappears. Non-echo local
    // lines (notes/bot replies, M7 T3) are never touched here.
    const consumed = new Set<number>();
    for (const line of transcriptLines) {
      if (line.who !== "user") continue;
      const idx = localLines.findIndex(
        (l, i) => l.echo === true && !consumed.has(i) && normalize(l.text) === line.text,
      );
      if (idx !== -1) consumed.add(idx);
    }
    const liveLocalLines = consumed.size === 0 ? localLines : localLines.filter((_, i) => !consumed.has(i));
    // Local lines are always appended, never merged/sorted by seq — they're
    // synthesized in the order they happened and are always the newest thing
    // in the chat (see store.ts's addLocalLine doc comment).
    return [...transcriptLines, ...liveLocalLines];
  }, [transcript, localLines]);
  const pending = useMemo<ChatSessionPending>(
    () => ({
      permissions: transcript?.pendingPermissions ?? [],
      questions: transcript?.pendingQuestions ?? [],
    }),
    [transcript],
  );

  const edits = useCampusEdits((s) => s.edits);
  const projects = useProjectsStore((s) => s.projects);

  const send = async (text: string): Promise<ChatSendResult> => {
    const trimmed = text.trim();
    if (!trimmed) return { ok: true };

    const rooms = linkedRoomsFromCampus(edits, projects);
    const ctx: IntentContext = { rooms };

    const intent = parseIntent(trimmed, ctx);
    if (intent) {
      // parseIntent only ever returns goto/emote (never "say") — see parse.ts.
      applyGotoOrEmote(key, intent as Extract<Intent, { kind: "goto" | "emote" }>, rooms);
      return { ok: true };
    }

    // "agent:*" keys are resting crew (sim/characters.ts's toCharacters) —
    // there's no session behind them at all, not merely one whose view
    // hasn't loaded yet, so they're always session-less regardless of
    // `status` (which reads undefined for them, same as an unloaded view).
    // Invariant shared with sim/characters.ts's toCharacters() and this
    // file's own isDemoKey — if either key format ever changes, this branch
    // must change too.
    const isRestingCrew = key.startsWith("agent:");
    // Demo bots aren't real sessions either, so they fall into the exact
    // same session-less path below as resting crew (Fix round 1: a demo
    // bot's ordinary prose used to be a hard no-op here — but in the real
    // Tauri app interpretIntent still reaches the backend for real even in
    // demo mode, and in a plain browser it silently resolves to null, which
    // already lands on the "scratches head" note. That's the designed
    // degradation; a demo-only special case was never needed).
    const isLive = !isDemoKey(key) && !isRestingCrew && status !== "Ended";
    if (isLive) {
      try {
        const res = await commands.sendToSession(sid, trimmed);
        if (res.status === "error") return { ok: false, error: res.error };
        // Instant echo — the real transcript line lands moments later and
        // dedupes against this one in the `lines` useMemo above.
        useGameChats.getState().addLocalLine(key, "user", trimmed, { echo: true });
        playSfx("send");
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }

    // Session-less (demo, resting crew, or Ended with no live session) —
    // ask the cheap fallback interpreter rather than leaving the message
    // stranded. interpretIntent never throws (silent null on any failure),
    // so a miss and an outright failure land on the exact same note.
    const fallback = await interpretIntent(trimmed, ctx);
    if (fallback === null) {
      useGameChats.getState().addLocalLine(key, "note", SCRATCHES_HEAD_NOTE);
    } else if (fallback.kind === "say") {
      pushLocalBubble(key, fallback.text);
      useGameChats.getState().addLocalLine(key, "bot", fallback.text);
    } else {
      applyGotoOrEmote(key, fallback, rooms);
    }
    return { ok: true };
  };

  return { lines, status, agent, pending, send };
}

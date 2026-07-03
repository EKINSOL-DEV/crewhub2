// Characters renderer (M1 T7): sim state -> animated robots on the campus.
// One `<CharacterActor>` per sim bot, keyed by `SimBot.key`; the single
// useFrame loop below owns all per-frame math (damped follow, T3's `pose`,
// status bulb) and writes it straight into three.js objects collected from
// the actors — no per-frame React state, no per-frame allocation of note.
import { Suspense, useEffect, useRef, useState, type MutableRefObject } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import * as THREE from "three";
import type { SessionStatus } from "@/ipc/bindings";
import type { Character } from "@/game/sim/characters";
import { SpeechBubble } from "@/game/chat/SpeechBubble";
import { useGameSpeechBubbles } from "@/game/chat/use-speech-bubbles";
import { thoughtFor, useFlavor } from "@/game/flavor/engine";
import { ThoughtBubble } from "@/game/flavor/ThoughtBubble";
import { Robot, type RobotHandles } from "./Robot";
import { pose } from "./pose";
import { useSim, type CharacterInfo } from "./use-sim";

/** Antenna bulb color per session status — agentId (resting crew) bots are Idle. */
export const BULB: Record<SessionStatus, string> = {
  Working: "#22c55e",
  WaitingForPermission: "#ef4444",
  WaitingForInput: "#f59e0b",
  Idle: "#94a3b8",
  Ended: "#94a3b8", // never actually rendered — toCharacters() drops Ended sessions
};

const DAMP_RATE = 8; // exponential damp rate for position/facing follow
const NAME_Y = 2.1;
const FALLBACK_COLOR = "#94a3b8";
// How often thought expiry is re-checked absent a new thought arriving —
// `thoughtFor` is a pure read (engine.ts doesn't prune the store), so
// nothing else forces a re-render once a thought's TTL passes. Coarse on
// purpose: a thought may linger up to this long past its TTL before the
// next tick hides it, unnoticeable at a 5s grain.
const NOW_TICK_MS = 5_000;

/** Shortest-arc exponential damp — same shape as THREE.MathUtils.damp, angle-aware. */
function dampAngle(current: number, target: number, rate: number, dt: number): number {
  const twoPi = Math.PI * 2;
  const diff = ((((target - current + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
  return current + diff * (1 - Math.exp(-rate * dt));
}

interface ActorRefs {
  group: THREE.Group;
  handles: RobotHandles;
}

function CharacterActor({
  botKey,
  x,
  z,
  facing,
  name,
  color,
  status,
  speechText,
  thoughtText,
  actorsRef,
  onSelect,
}: {
  botKey: string;
  x: number;
  z: number;
  facing: number;
  name: string;
  color: string;
  status: SessionStatus;
  speechText: string | undefined;
  thoughtText: string | undefined;
  actorsRef: MutableRefObject<Map<string, ActorRefs>>;
  onSelect: ((key: string, pos: { x: number; z: number }) => void) | undefined;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const handlesRef = useRef<RobotHandles | null>(null);

  // Robot (a child) mounts and fills `handlesRef` in its own effect first;
  // effects fire child-before-parent within a commit, so both refs are ready
  // here on mount. React attaches JSX `ref`s during commit, before any
  // effect runs, so `groupRef.current` is never null at this point either.
  useEffect(() => {
    const group = groupRef.current;
    const handles = handlesRef.current;
    if (!group || !handles) return;
    const actors = actorsRef.current;
    actors.set(botKey, { group, handles });
    return () => {
      actors.delete(botKey);
    };
  }, [botKey, actorsRef]);

  return (
    <group
      ref={groupRef}
      position={[x, 0, z]}
      rotation={[0, facing, 0]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        // groupRef's position is the live, per-frame-damped sim position —
        // more accurate than the `x`/`z` props, which only refresh when the
        // bot set itself changes (see the `version` comment below).
        const p = groupRef.current?.position;
        onSelect?.(botKey, { x: p?.x ?? x, z: p?.z ?? z });
      }}
    >
      <Robot color={color} bulbColor={BULB[status]} handles={handlesRef} />
      {/* drei's Text SUSPENDS on troika font preload — its own boundary so a
          slow/stalled font never hides the robot (or, via a shared boundary,
          the whole campus). */}
      <Suspense fallback={null}>
        <Billboard position={[0, NAME_Y, 0]}>
          <Text
            fontSize={0.32}
            color="#eef1f8"
            outlineWidth={0.02}
            outlineColor="#15171c"
            anchorX="center"
            anchorY="bottom"
            maxWidth={3}
          >
            {name}
          </Text>
        </Billboard>
      </Suspense>
      {/* Own boundary, same reasoning as the name label above. Speech wins —
          a thought is decorative flavor, a reply to the human is not. */}
      {speechText ? (
        <Suspense fallback={null}>
          <SpeechBubble text={speechText} />
        </Suspense>
      ) : (
        thoughtText && (
          <Suspense fallback={null}>
            <ThoughtBubble text={thoughtText} />
          </Suspense>
        )
      )}
    </group>
  );
}

export function Characters({
  override,
  onCount,
  onSelect,
}: {
  override?: Character[] | undefined;
  /** Live bot-set size, refreshed alongside `version` — the HUD roster chip's feed. */
  onCount?: ((n: number) => void) | undefined;
  /** Robot clicked — key is a session key ("provider:id") or "agent:<id>" for resting crew; pos is its live sim position. */
  onSelect?: ((key: string, pos: { x: number; z: number }) => void) | undefined;
}) {
  const { sim, version, infoRef } = useSim(override);
  const actorsRef = useRef<Map<string, ActorRefs>>(new Map());
  const speech = useGameSpeechBubbles();
  // Subscribed (return value unused) so a fresh thought shows immediately;
  // `nowMs` below covers the other half — hiding one once its TTL passes
  // with no new thought arriving to trigger a re-render on its own.
  useFlavor((s) => s.thoughts);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), NOW_TICK_MS);
    return () => clearInterval(t);
  }, []);

  useFrame((_state, delta) => {
    const dt = Math.min(delta, 0.1);
    for (const [key, bot] of sim.world.bots) {
      const actor = actorsRef.current.get(key);
      if (!actor) continue;
      const { group, handles } = actor;

      group.position.x = THREE.MathUtils.damp(group.position.x, bot.x, DAMP_RATE, dt);
      group.position.z = THREE.MathUtils.damp(group.position.z, bot.z, DAMP_RATE, dt);
      group.rotation.y = dampAngle(group.rotation.y, bot.facing, DAMP_RATE, dt);

      const p = pose(bot.motion, bot.age);
      handles.body.position.y = p.bodyY;
      handles.body.rotation.x = p.bodyTiltX;
      handles.head.rotation.x = p.headNodX;
      handles.head.rotation.z = p.headTiltZ;
      handles.armL.rotation.x = p.armL;
      handles.armR.rotation.x = p.armR;
      handles.eyes.scale.y = p.blink ? 0.1 : 1;

      const bulbColor = BULB[infoRef.current.get(key)?.status ?? "Idle"];
      handles.bulb.color.set(bulbColor);
      handles.bulb.emissive.set(bulbColor);
    }
  });

  // `version` only bumps on bot add/remove — that's the sole reason this list
  // needs to re-render; per-frame motion above never touches React state.
  // Reading `infoRef` has to happen in an effect (not render) — refs are for
  // outside-render access — so the actor list itself is a bit of derived
  // state, refreshed right after each set change.
  const [bots, setBots] = useState<
    { key: string; x: number; z: number; facing: number; info: CharacterInfo | undefined }[]
  >([]);
  useEffect(() => {
    const next = Array.from(sim.world.bots.entries()).map(([key, bot]) => ({
      key,
      x: bot.x,
      z: bot.z,
      facing: bot.facing,
      info: infoRef.current.get(key),
    }));
    setBots(next);
    onCount?.(next.length);
  }, [sim, version, infoRef, onCount]);

  return (
    <group>
      {bots.map(({ key, x, z, facing, info }) => {
        const thoughtText = thoughtFor(key, nowMs)?.text;
        return (
          <CharacterActor
            key={key}
            botKey={key}
            x={x}
            z={z}
            facing={facing}
            name={info?.name ?? key}
            color={info?.color ?? FALLBACK_COLOR}
            status={info?.status ?? "Idle"}
            speechText={speech[key]?.text}
            thoughtText={thoughtText}
            actorsRef={actorsRef}
            onSelect={onSelect}
          />
        );
      })}
    </group>
  );
}

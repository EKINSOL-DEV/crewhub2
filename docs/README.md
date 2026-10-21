# Rebuild documentation

These are the active documents for the browser-world rebuild. All are in English.

| Document | Purpose |
| --- | --- |
| [VISION.md](VISION.md) | User goals, product principles, and success criteria |
| [VISUAL_DIRECTION.md](VISUAL_DIRECTION.md) | Art direction, interactions, and visual quality bar |
| [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) | The crewhub-loops design system: tokens, primitives, theme, status mapping and checks |
| [ARCHITECTURE.md](ARCHITECTURE.md) | The architecture as built: the packages, the host's parts, the world's gate and screens, boundaries; and what the target diagram still lacks (world database, chat, director) |
| [GRID_ENGINE.md](GRID_ENGINE.md) | Coordinates, footprints, placement, navigation, and semantic world contract |
| [WORLD_STYLES.md](WORLD_STYLES.md) | The world style seam: manifest, semantic model keys, per-building resolution, Greenhouse; and casts, the swappable figures that stand for agents |
| [AGENT_CARD.md](AGENT_CARD.md) | The agent card (what an agent does now, sections from a registry, the lane facts, the portrait) and the follow camera |
| [ROOM_REVIEW.md](ROOM_REVIEW.md) | Historical: the first room's design and verification notes |
| [COST_POLICY.md](COST_POLICY.md) | Zero-model-cost presentation and optional AI controls; the measured heap and frame numbers of demo and live mode, and the first paint's numbers across the cuts of rounds 4 to 6 |
| [ROADMAP.md](ROADMAP.md) | Milestones, the loops phases and their status in demo and live mode, the host as built through round 7, what is open and which decisions wait for Nicky |
| [TOWN_PLAN.md](TOWN_PLAN.md) | Town model and room growth; runtime-binding parts superseded |
| [ASTRA_HANDOFF.md](ASTRA_HANDOFF.md) | Current handoff: where to start, the packages, how to run and verify |
| [ARCHIVE.md](ARCHIVE.md) | Preserved desktop version and recovery procedure |
| [decisions/0001-browser-world.md](decisions/0001-browser-world.md) | Recorded browser-first architecture decision |
| [decisions/0002-grid-world.md](decisions/0002-grid-world.md) | Grid semantics and rendering separation |
| [decisions/0003-towns-and-session-bindings.md](decisions/0003-towns-and-session-bindings.md) | Provider-independent towns and canonical session bindings |
| [decisions/0004-loops-design-system.md](decisions/0004-loops-design-system.md) | One design language with crewhub-loops for all 2D UI |
| [decisions/0005-crewhub-world-on-loops.md](decisions/0005-crewhub-world-on-loops.md) | Decision record for the crewhub-loops integration |
| [superpowers/specs/2026-09-30-loops-design-system-design.md](superpowers/specs/2026-09-30-loops-design-system-design.md) | Accepted spec for the loops design-system migration |
| [superpowers/specs/2026-10-01-world-demo-mode-design.md](superpowers/specs/2026-10-01-world-demo-mode-design.md) | Accepted spec for the demo-mode build and every addendum since: casts, scale and zones, loops readiness, three rooms, live on the Mac crewhub-loops, a person in the world and closed buildings, a smooth connection, the new loops events; and the proposal, not built, for project groups and the director in live mode |
| [LOOPS_INTEGRATION_PLAN.md](LOOPS_INTEGRATION_PLAN.md) | The plan: CrewHub World as a thin 3D layer on crewhub-loops; section 10 says what each phase built, in demo mode and against the real crewhub-loops |
| [LOOPS_SETUP.md](LOOPS_SETUP.md) | The runbook for the Mac app (`Crewhub.app`): the morning in three steps (`npm run world`, make the external bot, paste its key), then the reference: the env, the commands and the doctor, pairing, the health read, what each chip and screen means, the Connection panel, and the developers' private crewhub-loops |
| [LOOPS_GAP_ANALYSIS.md](LOOPS_GAP_ANALYSIS.md) | What crewhub-loops provides against what the world needs: phase verdict, drift, what changed up to `4cdcd383`, and the list of what is still missing (the viewer key L1 as a worked proposal on a loops branch) |
| [LOOPS_REAL_VS_FAKE.md](LOOPS_REAL_VS_FAKE.md) | What crewhub-loops `4cdcd383` does on the wire that the fake did not (from runs against the development instance), and how the host and the fake follow it now, the new event types included |
| [../skills/prop-builder/SKILL.md](../skills/prop-builder/SKILL.md) | The `prop-builder` skill: requests become valid `crewhub-prop/1` props |

The night report is [reports/2026-10-01-world-demo-night.md](reports/2026-10-01-world-demo-night.md): what was
built per phase and per round since (the demo build, the art and performance rounds, casts, scale, loops readiness,
three rooms, live on the Mac crewhub-loops, a smooth connection, and rounds 3 to 7 of 2026-10-21: the morning rehearsed,
regressions, the first paint, the new loops events, the operations road), its verification, and the challenges met in the
crewhub-loops integrator docs.

Outside this folder, each workspace has its own README: [apps/host](../apps/host/README.md) (the relay: routes,
env, commands, pairing), [apps/world](../apps/world/README.md), [packages/loops-client](../packages/loops-client/README.md),
[packages/loops-fake](../packages/loops-fake/README.md), [packages/demo](../packages/demo/README.md) with its
[storyline](../packages/demo/CONTENT.md), [packages/world-model](../packages/world-model/README.md),
[packages/world-engine](../packages/world-engine/README.md), and [tools](../tools/README.md) for the browser checks,
the measurements, the first-paint profiler, the seed and the development crewhub-loops.

Read [AGENTS.md](../AGENTS.md) before implementation. Historical plans are retained
in the archive and Git history; they do not constrain the new visual experience.

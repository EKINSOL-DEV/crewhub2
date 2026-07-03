# Changelog

All notable user-facing changes to CrewHub v2. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org).

How releases consume this file (M6, EKI-98/EKI-100):

- `.github/workflows/release.yml` extracts the `## [x.y.z]` section matching the tag `vx.y.z`
  (via `scripts/extract-release-notes.mjs`) and uses it as the GitHub release body — which the
  in-app "What's new" dialog renders after an update.
- Before tagging: rename `## [Unreleased]` to `## [x.y.z] - YYYY-MM-DD` and add a fresh empty
  `## [Unreleased]` section above it. Full runbook: `docs/RELEASING.md`.
- Tagging a version that has no changelog section fails the release run on purpose.
- Section headings may carry a date suffix (`## [0.1.0] - 2026-06-12`); within a section use the
  Keep-a-Changelog categories (`### Added`, `### Changed`, `### Fixed`, `### Removed`) as needed.

## [Unreleased]

### Added

- M8 "Camera director" — the camera plays along (EKI-183): click a room or the HQ and the
  camera flies to frame it (shortest rotation, approaching multi-door buildings via the door
  nearest your current angle); click a robot and the camera follows it around; Escape or the
  🎥✕ chip flies you back to where you were, while grabbing the camera (drag/WASD) simply
  hands control back; wheel-zoom and rotate keep working mid-shot
- M7 "Say the word" — the chat is location-aware (EKI-182): tell any robot "go to HQ",
  "go to <room>" or "dance / spin / cheer / wave" and it obeys — a free deterministic parser
  handles the commands (never touching your real session's context), a Haiku fallback interprets
  everything else for session-less bots, so asking a resting crew member for a joke answers in
  its speech bubble; command confirmations appear as chat notes + bubbles, and the composer
  hints at what to try
- M6 "Headquarters" — the campus has a heart (EKI-181): a permanent 4-door HQ at the center
  (never deletable, never project-linked) where new robots spawn and walk out through the door,
  crew rests inside, and waiting/overflow bots gather on a ring outside its walls; three
  interactive props inside — 📋 opens a full in-game Projects manager (create/edit/delete),
  👥 hires crew, 🧰 opens the workspace; clicking the HQ shows the crew roster; the fountain
  moved into the build palette as placeable animated decor
- M5 "Project rooms" — buildings mean something (EKI-174): every pavilion/building links to a
  project (the folder it lives in) via a click-to-open room card or the post-placement dialog;
  robots whose session/agent works in that folder take desks INSIDE their project's room, and
  bots without a room wander the campus outside; rooms grew real walls with an open door
  (pathfinding enforced — robots walk in through the doorway), roof nameplates with the project
  icon and name, and project-colored trim
- M4 "It breathes" — the campus IS the app (EKI-164): the game is now the main window (the old
  2D world panel is gone; the workspace lives in its own window via the 🧰 chip), robots think
  out loud with Haiku-powered thought bubbles (budget-capped, 💭 run counter, kill switch in
  settings KV), three new environments — Desert 🏜️, Island 🏝️, Sky ✨ — day/night toggle with
  moonlit lighting, CC0 UI sound effects (mutable), and a first-run welcome card

- M3 "Build it" — lay out your own campus (EKI-157): 🔨 Build mode with a tool palette, snap-grid
  decor placement with ghost preview, building footprints that auto-generate desks (optionally
  linked to a Room, color-tinted), select/move/rotate/delete; robots re-plan onto placed desks
  without respawning; everything persists. Plus a 2.4x render CPU cut (frame limiter, halfRes AO,
  30Hz shadows, frozen static matrices) after the M2 fan-noise report
- M2 "Talk to them" — conversations inside the game (EKI-149): click a robot for a game-styled
  chat window over the live transcript (real send), speech bubbles for assistant replies,
  permission/question prompts as "the robot asks you" cards (allow/always/deny, single/multi
  answers, plan approval), `+ Hire` dialog (spawn crew agents with a voice-model picker, adopt
  or fork existing sessions), camera focus on chat open
- M1 "Robots alive" — session-driven boxy robots on the campus (EKI-138): pavilions with desks
  on the four plots, pure-TS sim (grid A\* + 10Hz deterministic state machine), status-driven
  behavior (work at desk, raise hand at the plaza, think, wander, crew rests), animated mascot
  with nameplates and status bulbs, `?game&demo` scene, HUD roster count
- M0 "Gorgeous empty campus" — new game frontend behind `?game` (EKI-124): CC0 asset pipeline
  (Kenney Nature + Fantasy Town kits, meshopt-optimized), toon + ink-outline rendering with N8AO
  and vignette, RTS game camera with edge scrolling, environment system with Campus as the first
  environment, quality tiers (low/medium/high), plaza with animated fountain, drifting clouds
- First-run environment detection (Claude CLI probe, recent-project scan) and sample crew (EKI-86, EKI-88)
- Hooks bridge live end-to-end: signal sidecar bundled, install preview + byte-identical uninstall (EKI-86)
- OS notification sink, five new notification triggers, tray icon + pending-permission dock badge (EKI-92, EKI-94)
- Auto-updater with pinned public key and "What's new" release notes on relaunch (EKI-100)
- One-shot, read-only importer from CrewHub v1's `~/.crewhub/crewhub.db` (EKI-106)
- Local-only error log (`errors.jsonl` ring) and user-initiated "Report issue" bundle (EKI-102)
- CI release pipeline: tag-triggered multi-platform builds with signing/notarization that degrade
  gracefully to unsigned artifacts when secrets are absent (EKI-98)

### Fixed

- Debt sweep (EKI-171): editing one decor kind no longer remounts the others; robot clicks no
  longer place decor beneath them; ended sessions with an agent can be woken from the chat
  composer; the sky environment no longer leaves invisible walls; e2e boot specs rewritten
  against the game shell (EKI-148); nameplate renames refresh live; fountain water no longer
  slowly tips vertical

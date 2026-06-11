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

- First-run environment detection (Claude CLI probe, recent-project scan) and sample crew (EKI-86, EKI-88)
- Hooks bridge live end-to-end: signal sidecar bundled, install preview + byte-identical uninstall (EKI-86)
- OS notification sink, five new notification triggers, tray icon + pending-permission dock badge (EKI-92, EKI-94)
- Auto-updater with pinned public key and "What's new" release notes on relaunch (EKI-100)
- One-shot, read-only importer from CrewHub v1's `~/.crewhub/crewhub.db` (EKI-106)
- Local-only error log (`errors.jsonl` ring) and user-initiated "Report issue" bundle (EKI-102)
- CI release pipeline: tag-triggered multi-platform builds with signing/notarization that degrade
  gracefully to unsigned artifacts when secrets are absent (EKI-98)

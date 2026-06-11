# Releasing CrewHub v2

Releases come from CI only — `.github/workflows/release.yml`, triggered by a `v*` tag (or
`workflow_dispatch` for rehearsals). Local release builds are never shipped. (M6 — EKI-98/EKI-100,
plan decisions D-M6-6/D-M6-7.)

## Secrets matrix

The workflow runs without **all** of these — every missing secret degrades, never blocks
(D-M6-6). Configure them as GitHub Actions repository secrets.

| Secret                               | Used by                           | Absent ⇒                                                                                                                                                       |
| ------------------------------------ | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`          | updater artifact signing          | updater artifacts disabled (`createUpdaterArtifacts: false` overlay), bundles uploaded as workflow artifacts named `…-unsigned`, **no GitHub release created** |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | ditto                             | ditto                                                                                                                                                          |
| `APPLE_CERTIFICATE` (.p12, base64)   | macOS codesign                    | unsigned .app/.dmg (Gatekeeper-blocked, dev-testable)                                                                                                          |
| `APPLE_CERTIFICATE_PASSWORD`         | ditto                             | ditto                                                                                                                                                          |
| `APPLE_ID`                           | notarization (`notarytool`)       | notarization skipped                                                                                                                                           |
| `APPLE_TEAM_ID`                      | ditto                             | ditto                                                                                                                                                          |
| `APPLE_PASSWORD` (app-specific)      | ditto                             | ditto                                                                                                                                                          |
| `SONAR_TOKEN`                        | ci.yml Sonar (already configured) | —                                                                                                                                                              |

Degradation is computed once, in the workflow's `plan` job, from secret presence — flipping
signing on requires **adding secrets only, zero code change**. A signed+notarized macOS artifact
is the v2.0 release gate; Windows/Linux are best-effort (`continue-on-error`, master plan R6).

## Updater signing keys

- Private key: `~/.tauri/crewhub2.key` on the release machine and in the two `TAURI_SIGNING_*`
  secrets — **NEVER in the repo**.
- Public key: pinned in `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`, EKI-100). For
  reference:

```
dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDIzQjY5N0I1RTgwOUY1NjIKUldSaTlRbm90WmUySThnalZKc3NOd1g0bm00eCtHa1RrVFJNYTZtV292WEQ1UEpIVmY2dGFzMjIK
```

## Updater manifest hosting

There is no CDN and no custom server. The updater endpoint pinned in `tauri.conf.json` is

```
https://github.com/EKINSOL-DEV/crewhub2/releases/latest/download/latest.json
```

i.e. the `latest.json` asset of the **latest published GitHub release**. `tauri-action` generates
and uploads `latest.json` (signatures + per-platform download URLs) to the draft release alongside
the bundles. Because draft-release assets are invisible to that URL, **publishing the draft is the
updater go-live** — and the staged-rollout / rollback lever:

- **Staged rollout:** keep the draft until the artifacts have been smoke-tested; publish when
  ready. Nothing reaches users before publish.
- **Rollback:** a bad release is rolled back by deleting (or re-marking as draft/prerelease) the
  published release so `releases/latest` points at the previous good one again. No client-side
  action is needed; clients simply see the older manifest.

## Versioning

Semver, bumped **together** in `src-tauri/tauri.conf.json` and `package.json`. Enforced by
`scripts/check-version-sync.mjs` (`pnpm version:check`): ci.yml checks the two files agree on
every PR; release.yml additionally asserts the tag equals `v<version>` before anything builds.

## Release runbook

1. **Bump versions** in `src-tauri/tauri.conf.json` + `package.json` (keep them identical);
   `pnpm version:check` locally.
2. **Changelog:** in `CHANGELOG.md`, rename `## [Unreleased]` to `## [x.y.z] - YYYY-MM-DD` and add
   a fresh empty `## [Unreleased]` above it. The release body — and the in-app "What's new"
   dialog — comes from this section; a tag without its section fails the run on purpose.
3. Land the bump on `main` through the normal PR gates.
4. **Tag:** `git tag vx.y.z && git push origin vx.y.z`. CI builds macOS (aarch64 + x86_64,
   required), Windows and Linux (best-effort) and assembles a **draft** release with all bundles
   and `latest.json`.
5. **Smoke the draft artifacts** (install + launch on a clean machine; on the first signed macOS
   build verify Gatekeeper/notarization with `spctl -a -vv`).
6. **Publish the draft** = updater go-live (see hosting section above). Existing installs pick the
   update up from `latest.json`; the "What's new" dialog shows the changelog section.
7. If something is wrong after publish: roll back per the hosting section, fix forward with a new
   patch tag.

### Rehearsal (no tag, works with zero secrets)

```
gh workflow run release.yml --repo EKINSOL-DEV/crewhub2 --ref <branch>
```

A `workflow_dispatch` run never creates a release: it builds all platforms and uploads the bundles
as workflow artifacts (named `…-unsigned` when the updater key is absent), with release notes
taken from the `[Unreleased]` changelog section. This is how the degradation path stays CI-tested
before any secret exists (M6 §3.6).

## macOS architecture note

macOS ships as two single-arch artifacts (`aarch64-apple-darwin`, `x86_64-apple-darwin`) rather
than one universal binary: the `crewhub-signal` sidecar is built per target triple by
`src-tauri/build.rs` (`bundle.externalBin` expects `binaries/crewhub-signal-<triple>`), and the
updater manifest serves each platform key its own artifact anyway. Revisit only if a single-DMG
download becomes a real need (it would require lipo-ing the sidecar for `universal-apple-darwin`).

# Releasing CrewHub v2

## Updater signing

- Private key: `~/.tauri/crewhub2.key` on the release machine — **NEVER in the repo**.
- Public key (pin in `tauri.conf.json` when the updater plugin lands in M6, EKI-100):

```
dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDIzQjY5N0I1RTgwOUY1NjIKUldSaTlRbm90WmUySThnalZKc3NOd1g0bm00eCtHa1RrVFJNYTZtV292WEQ1UEpIVmY2dGFzMjIK
```

- CI release workflow (M6, EKI-98/EKI-100) signs artifacts with GitHub secrets:
  `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- macOS builds are additionally codesigned + notarized (Apple Developer ID; secrets:
  `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_PASSWORD`).

## Rules

- Local release builds are never shipped; releases come from CI only.
- Versioning: semver, bumped together in `src-tauri/tauri.conf.json` and `package.json`.
- Every release gets a changelog entry consumed by the in-app "What's new" dialog (M6, EKI-100).

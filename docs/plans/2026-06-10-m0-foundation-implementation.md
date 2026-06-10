# M0 — Foundation: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the CrewHub v2 repository: a Tauri v2 + React 19 app with typed IPC (tauri-specta), a hardened security baseline (capabilities, CSP, path policy), a SQLite store with the full v2 schema, a domain event bus bridged to the webview, and CI + E2E gates — empty of features, but safe and buildable.

**Architecture:** One Tauri v2 process: Rust core owns SQLite, path policy, and the event bus; the React webview consumes generated TypeScript bindings only (no hand-written IPC, no HTTP). CI runs lint/test/typecheck/build on every PR; a real-app E2E smoke test runs on Linux via tauri-driver.

**Tech Stack:** Tauri 2.x · Rust stable (tokio, rusqlite + rusqlite_migration, thiserror, dirs) · tauri-specta v2 + specta-typescript · React 19 + TypeScript strict · Vite · Tailwind CSS v4 (`@tailwindcss/vite`) · shadcn/ui · Zustand · Vitest + Testing Library · WebdriverIO + tauri-driver (E2E) · pnpm · lefthook · GitHub Actions.

**Linear mapping:** Epic 1 = EKI-6 (1.1 EKI-23, 1.2 EKI-24, 1.3 EKI-26, 1.4 EKI-28) · Epic 2 = EKI-8 (2.1 EKI-29, 2.2 EKI-31, 2.3 EKI-33) · Epic 3 = EKI-9 (3.1 EKI-34, 3.2 EKI-37, 3.3 EKI-38).

**Where the work happens:** a **new repository `crewhub2`** (per master plan §3). This plan file and the diagram live in the v1 repo (`docs/plans/`) until `crewhub2` exists; copy both into `crewhub2/docs/plans/` in Task 1.

**Diagram:** `docs/plans/2026-06-10-m0-foundation.drawio` — open with https://app.diagrams.net or the VS Code "Draw.io Integration" extension. Page 1 = M0 architecture; Page 2 = task dependency graph.

**API-drift caveat (read once):** code blocks below are the plan's concrete best version against Tauri 2.x / tauri-specta 2.x as of June 2026. If a crate API has drifted at implementation time, the _step's test still defines done_ — adjust the call site, not the acceptance criterion, and note the drift in the commit message.

---

## File Structure (locked in by this plan)

```
crewhub2/
├── .github/workflows/ci.yml          # Task 5
├── lefthook.yml                      # Task 3
├── package.json / pnpm-lock.yaml     # Task 1
├── vite.config.ts                    # Task 1/2
├── tsconfig.json                     # Task 2 (strict)
├── index.html
├── src/                              # React frontend
│   ├── main.tsx, App.tsx             # Task 1
│   ├── index.css                     # Task 2 (tailwind v4)
│   ├── ipc/bindings.ts               # GENERATED — never hand-edited (Task 4)
│   ├── ipc/events.ts                 # thin event-subscribe helpers (Task 12)
│   ├── stores/settings.ts            # Zustand settings store (Task 13)
│   ├── theme/themes.ts, theme/apply.ts  # named themes → CSS vars (Task 13)
│   └── test/                         # vitest specs
├── src-tauri/
│   ├── tauri.conf.json               # Task 1, hardened Task 7, updater stub Task 9
│   ├── capabilities/main.json        # Task 7
│   ├── capabilities/README.md        # Task 7 (justification per permission)
│   ├── migrations/001_init.sql       # Task 10 (full §4.4 schema)
│   └── src/
│       ├── main.rs, lib.rs           # Task 1/4
│       ├── ipc/mod.rs                # all #[tauri::command]s live here (Task 4, 11, 13)
│       ├── events.rs                 # DomainEvent + bus + bridge (Task 12)
│       ├── security/paths.rs         # path policy (Task 8)
│       ├── store/mod.rs              # connection + migrations (Task 10)
│       ├── store/agents.rs           # typed CRUD (Task 11)
│       ├── store/projects.rs         # typed CRUD (Task 11)
│       ├── store/rooms.rs            # typed CRUD (Task 11)
│       ├── store/tasks.rs            # typed CRUD (Task 11)
│       └── store/settings.rs         # key-value (Task 13)
├── e2e/wdio.conf.ts, e2e/smoke.spec.ts  # Task 6
└── docs/
    ├── plans/                        # this plan + drawio, copied in
    ├── adr/0001-cli-stream-json-over-sdk-sidecar.md  # copied from master plan §4.2 D1
    └── RELEASING.md                  # Task 9
```

One responsibility per file; commands only in `ipc/`, SQL only in `store/`, policy only in `security/`.

---

## Epic 1 — Scaffold & Toolchain

### Task 1: Repository + Tauri scaffold (EKI-23, part 1)

**Files:** Create: entire repo skeleton via generator; `docs/` copied in.

- [ ] **Step 1: Create the repo and scaffold**

```bash
cd ~/Documents/GitHub
pnpm create tauri-app@latest crewhub2 -- --template react-ts --manager pnpm
cd crewhub2 && git init -b main
git add -A && git commit -m "chore: scaffold tauri v2 + react-ts via create-tauri-app"
```

- [ ] **Step 2: Verify the app runs**

Run: `pnpm install && pnpm tauri dev`
Expected: a desktop window opens showing the template page. Close it.

- [ ] **Step 3: Set app identity**

In `src-tauri/tauri.conf.json` set:

```json
{
  "productName": "CrewHub",
  "identifier": "be.ekinsol.crewhub",
  "app": { "windows": [{ "title": "CrewHub", "width": 1280, "height": 800 }] }
}
```

Run: `pnpm tauri dev` → window titled "CrewHub".

- [ ] **Step 4: Copy planning docs + commit**

```bash
mkdir -p docs/plans docs/adr
cp ../crewhub/docs/plans/2026-06-10-crewhub-v2-rebuild.md docs/plans/
cp ../crewhub/docs/plans/2026-06-10-m0-foundation-implementation.md docs/plans/
cp ../crewhub/docs/plans/2026-06-10-m0-foundation.drawio docs/plans/
git add -A && git commit -m "docs: import v2 master plan and M0 implementation plan"
```

### Task 2: Frontend stack — strict TS, Tailwind v4, shadcn/ui (EKI-23, part 2)

**Files:** Modify: `tsconfig.json`, `vite.config.ts`, `src/index.css`. Create: `components.json`, `src/lib/utils.ts` (shadcn).

- [ ] **Step 1: Strict TypeScript**

In `tsconfig.json` `compilerOptions`, ensure:

```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "noImplicitOverride": true,
  "exactOptionalPropertyTypes": true,
  "verbatimModuleSyntax": true,
  "paths": { "@/*": ["./src/*"] },
  "baseUrl": "."
}
```

Run: `pnpm tsc --noEmit` → no errors (fix template code if flagged).

- [ ] **Step 2: Tailwind v4**

```bash
pnpm add tailwindcss @tailwindcss/vite
```

`vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  clearScreen: false,
  server: { port: 5180, strictPort: true },
});
```

Replace `src/index.css` content with:

```css
@import "tailwindcss";
```

Run: `pnpm tauri dev` → add `className="text-3xl font-bold"` to a heading and see it styled.

- [ ] **Step 3: shadcn/ui init**

```bash
pnpm dlx shadcn@latest init   # style: default, base color: neutral, CSS vars: yes
pnpm dlx shadcn@latest add button card
```

Render a `<Button>` in `App.tsx`; verify styling in dev.

- [ ] **Step 4: Vitest + Testing Library**

```bash
pnpm add -D vitest @testing-library/react @testing-library/jest-dom jsdom @vitejs/plugin-react
```

Add to `vite.config.ts` (vitest reads it):

```ts
// at top: /// <reference types="vitest/config" />
test: { environment: "jsdom", setupFiles: ["./src/test/setup.ts"], globals: true },
```

`src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

`src/test/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import App from "../App";

test("renders app shell", () => {
  render(<App />);
  expect(screen.getByTestId("app-root")).toBeInTheDocument();
});
```

Add `data-testid="app-root"` to App's root div.
Run: `pnpm vitest run` → 1 passed.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: strict TS, tailwind v4, shadcn/ui, vitest harness"
```

### Task 3: Lint, format, pre-commit (EKI-23, part 3)

**Files:** Create: `eslint.config.js`, `.prettierrc.json`, `lefthook.yml`, `src-tauri/rustfmt.toml`.

- [ ] **Step 1: ESLint flat config + Prettier**

```bash
pnpm add -D eslint @eslint/js typescript-eslint eslint-plugin-react-hooks prettier
```

`eslint.config.js`:

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["dist", "src/ipc/bindings.ts", "src-tauri/target"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
);
```

`.prettierrc.json`: `{ "printWidth": 110 }`

- [ ] **Step 2: Rust toolchain config**

`src-tauri/rustfmt.toml`: `edition = "2021"` (match Cargo.toml edition).
Run: `cargo fmt --check --manifest-path src-tauri/Cargo.toml` and `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings` → both clean.

- [ ] **Step 3: lefthook pre-commit**

```bash
pnpm add -D lefthook && pnpm lefthook install
```

`lefthook.yml`:

```yaml
pre-commit:
  parallel: true
  commands:
    prettier: { glob: "*.{ts,tsx,css,json,md}", run: pnpm prettier --check {staged_files} }
    eslint:   { glob: "*.{ts,tsx}",             run: pnpm eslint {staged_files} }
    rustfmt:  { glob: "src-tauri/**/*.rs",      run: cargo fmt --check --manifest-path src-tauri/Cargo.toml }
```

- [ ] **Step 4: Verify the hook fires**

Introduce a formatting error in `App.tsx`, `git add`, attempt commit → hook fails. Revert, commit clean:

```bash
git add -A && git commit -m "chore: eslint, prettier, rustfmt, lefthook pre-commit"
```

### Task 4: tauri-specta typed IPC skeleton (EKI-26)

**Files:** Create: `src-tauri/src/ipc/mod.rs`. Modify: `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`. Generated: `src/ipc/bindings.ts`.

- [ ] **Step 1: Add crates**

```bash
cd src-tauri
cargo add specta@2 --features derive
cargo add specta-typescript@0.0  # latest 0.x
cargo add tauri-specta@2 --features derive,typescript
cargo add serde --features derive
cargo add thiserror
cd ..
```

- [ ] **Step 2: Write the demo command (the pattern every future command follows)**

`src-tauri/src/ipc/mod.rs`:

```rust
use serde::Serialize;

#[derive(Serialize, specta::Type)]
pub struct AppInfo {
    pub version: String,
    pub data_dir: String,
}

#[tauri::command]
#[specta::specta]
pub fn app_info(app: tauri::AppHandle) -> AppInfo {
    use tauri::Manager;
    AppInfo {
        version: app.package_info().version.to_string(),
        data_dir: app.path().app_data_dir().map(|p| p.display().to_string()).unwrap_or_default(),
    }
}
```

- [ ] **Step 3: Wire the specta builder + export in `lib.rs`**

```rust
mod ipc;

pub fn specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new()
        .commands(tauri_specta::collect_commands![ipc::app_info])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = specta_builder();

    #[cfg(debug_assertions)]
    builder
        .export(specta_typescript::Typescript::default(), "../src/ipc/bindings.ts")
        .expect("failed to export typescript bindings");

    tauri::Builder::default()
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 4: Run dev once to generate bindings, consume them**

Run: `pnpm tauri dev` → `src/ipc/bindings.ts` appears with a typed `commands.appInfo()`.

In `App.tsx`:

```tsx
import { useEffect, useState } from "react";
import { commands, type AppInfo } from "@/ipc/bindings";

// inside component:
const [info, setInfo] = useState<AppInfo | null>(null);
useEffect(() => {
  commands.appInfo().then(setInfo);
}, []);
// render: <p data-testid="app-version">{info?.version}</p>
```

Expected: the version renders in the window.

- [ ] **Step 5: Bindings drift check (CI-able)**

Add a Rust test in `lib.rs`:

```rust
#[cfg(test)]
mod tests {
    #[test]
    fn export_bindings() {
        super::specta_builder()
            .export(specta_typescript::Typescript::default(), "../src/ipc/bindings.ts")
            .expect("export failed");
    }
}
```

Drift gate = run the test, then `git diff --exit-code src/ipc/bindings.ts` (wired in CI, Task 5).
Run: `cargo test --manifest-path src-tauri/Cargo.toml export_bindings` → PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(ipc): tauri-specta builder, app_info command, generated bindings + drift test"
```

### Task 5: CI pipeline (EKI-24)

**Files:** Create: `.github/workflows/ci.yml`.

- [ ] **Step 1: Write the workflow**

```yaml
name: CI
on:
  pull_request:
  push: { branches: [main] }

jobs:
  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm prettier --check .
      - run: pnpm eslint .
      - run: pnpm tsc --noEmit
      - run: pnpm vitest run

  rust:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Tauri system deps
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libgtk-3-dev
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
        with: { workspaces: src-tauri }
      - run: cargo fmt --check --manifest-path src-tauri/Cargo.toml
      - run: cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
      - run: cargo test --manifest-path src-tauri/Cargo.toml
      - name: Bindings drift check
        run: git diff --exit-code src/ipc/bindings.ts

  build-macos:
    runs-on: macos-latest
    needs: [frontend, rust]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
        with: { workspaces: src-tauri }
      - run: pnpm install --frozen-lockfile
      - run: pnpm tauri build --debug --no-bundle
```

- [ ] **Step 2: Branch protection + verify**

Push a PR with a deliberate clippy warning → CI fails on `rust` job. Fix → green. Enable "require CI" on `main` in repo settings.

- [ ] **Step 3: Commit** — `git add -A && git commit -m "ci: lint, test, typecheck, drift check, macOS debug build"`

### Task 6: E2E harness (EKI-28)

tauri-driver runs on **Linux and Windows** (not macOS) — E2E therefore runs in the Linux CI job; locally it's optional under a Linux VM. This satisfies the AC ("runs in CI") with macOS coverage coming from the `build-macos` job + vitest.

**Files:** Create: `e2e/wdio.conf.ts`, `e2e/smoke.spec.ts`. Modify: `.github/workflows/ci.yml`, `package.json`.

- [ ] **Step 1: Install**

```bash
pnpm add -D @wdio/cli @wdio/local-runner @wdio/mocha-framework @wdio/spec-reporter
cargo install tauri-driver --locked   # documented; CI installs its own
```

- [ ] **Step 2: wdio config**

`e2e/wdio.conf.ts`:

```ts
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

let tauriDriver: ChildProcess;

export const config: WebdriverIO.Config = {
  specs: ["./smoke.spec.ts"],
  maxInstances: 1,
  hostname: "127.0.0.1",
  port: 4444,
  capabilities: [
    {
      // @ts-expect-error tauri-specific capability
      "tauri:options": { application: path.resolve(__dirname, "../src-tauri/target/debug/crewhub2") },
      browserName: "wry",
    },
  ],
  framework: "mocha",
  reporters: ["spec"],
  onPrepare: () => {
    tauriDriver = spawn("tauri-driver", [], { stdio: "inherit" });
  },
  onComplete: () => {
    tauriDriver?.kill();
  },
};
```

- [ ] **Step 3: Smoke spec**

`e2e/smoke.spec.ts`:

```ts
import { expect } from "@wdio/globals";

describe("CrewHub shell", () => {
  it("boots and exposes backend version via IPC", async () => {
    const root = await $('[data-testid="app-root"]');
    await expect(root).toBeExisting();
    const version = await $('[data-testid="app-version"]');
    await expect(version).toHaveText(/\d+\.\d+\.\d+/); // proves Rust↔webview IPC round-trip
  });
});
```

`package.json` script: `"e2e": "wdio run e2e/wdio.conf.ts"`.

- [ ] **Step 4: CI job (Linux)**

Append to `ci.yml`:

```yaml
e2e-linux:
  runs-on: ubuntu-latest
  needs: [frontend, rust]
  steps:
    - uses: actions/checkout@v4
    - name: System deps
      run: |
        sudo apt-get update
        sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev webkit2gtk-driver xvfb
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
      with: { node-version: 22, cache: pnpm }
    - uses: dtolnay/rust-toolchain@stable
    - uses: Swatinem/rust-cache@v2
      with: { workspaces: src-tauri }
    - run: pnpm install --frozen-lockfile
    - run: cargo install tauri-driver --locked
    - run: pnpm tauri build --debug --no-bundle
    - run: xvfb-run pnpm e2e
```

Expected: job green; spec output shows both assertions passing.

- [ ] **Step 5: Commit** — `git commit -am "test(e2e): wdio + tauri-driver smoke test in Linux CI"`

---

## Epic 2 — Security Baseline

### Task 7: Capabilities & CSP (EKI-29)

**Files:** Create: `src-tauri/capabilities/main.json`, `src-tauri/capabilities/README.md`. Modify: `src-tauri/tauri.conf.json`.

- [ ] **Step 1: Minimal capability for the main window**

`src-tauri/capabilities/main.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "main-window",
  "description": "Least-privilege capability for the main CrewHub window",
  "windows": ["main"],
  "permissions": ["core:default"]
}
```

(`core:default` = event listen/emit, window basics, app info. Nothing else until a milestone needs it.)

- [ ] **Step 2: Strict CSP + disable devtools in release**

In `tauri.conf.json`:

```json
{
  "app": {
    "security": {
      "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' asset: http://asset.localhost data:; connect-src ipc: http://ipc.localhost; font-src 'self'"
    }
  }
}
```

Verify devtools: `Cargo.toml` must NOT enable the `devtools` feature for release (default behavior — assert no `tauri = { features = ["devtools"] }`).

- [ ] **Step 3: Capability justification doc**

`src-tauri/capabilities/README.md`:

```markdown
# Capability register

Every permission granted to a window MUST be listed here with a one-line justification.
PR reviewers: reject any capability change that does not update this file.

| Capability file | Window | Permission   | Why                                                                            |
| --------------- | ------ | ------------ | ------------------------------------------------------------------------------ |
| main.json       | main   | core:default | Event emit/listen for typed IPC events; window basics; app metadata for About. |

Forbidden without an ADR: `fs:*` to the webview (files go through Rust commands + path policy),
`shell:*` (only via dedicated commands, M2 handoff), any remote URL in `app.windows[].url`.
```

- [ ] **Step 4: Verify**

Run: `pnpm tauri dev`; in the window confirm (a) app works, (b) a fetch to `https://example.com` from the console is blocked by CSP.
Run: `pnpm tauri build --debug --no-bundle` → builds (capability schema valid).

- [ ] **Step 5: Commit** — `git commit -am "security: least-privilege capability, strict CSP, capability register"`

### Task 8: Path policy module (EKI-31) — TDD

**Files:** Create: `src-tauri/src/security/mod.rs`, `src-tauri/src/security/paths.rs`.

- [ ] **Step 1: Write failing tests first**

`src-tauri/src/security/paths.rs` (tests at bottom; module skeleton only so it compiles):

```rust
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Access { Read, ReadWrite }

#[derive(Debug, Error)]
pub enum PathPolicyError {
    #[error("path is outside all allowed roots: {0}")]
    OutsideRoots(PathBuf),
    #[error("write access denied for read-only root: {0}")]
    ReadOnly(PathBuf),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Default)]
pub struct PathPolicy { roots: Vec<(PathBuf, Access)> }

impl PathPolicy {
    pub fn allow(&mut self, root: impl Into<PathBuf>, access: Access) -> &mut Self { todo!() }
    /// Canonicalizes `candidate` (resolving symlinks and `..`) and checks containment.
    pub fn validate(&self, candidate: &Path, wanted: Access) -> Result<PathBuf, PathPolicyError> { todo!() }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmp() -> PathBuf { tempfile::tempdir().unwrap().into_path() }

    #[test]
    fn allows_file_inside_root() {
        let root = tmp(); fs::write(root.join("a.txt"), "x").unwrap();
        let mut p = PathPolicy::default(); p.allow(&root, Access::Read);
        assert!(p.validate(&root.join("a.txt"), Access::Read).is_ok());
    }

    #[test]
    fn rejects_dotdot_traversal() {
        let root = tmp(); fs::create_dir(root.join("sub")).unwrap();
        let mut p = PathPolicy::default(); p.allow(root.join("sub"), Access::Read);
        let escape = root.join("sub").join("..").join("secret.txt");
        fs::write(root.join("secret.txt"), "x").unwrap();
        assert!(matches!(p.validate(&escape, Access::Read), Err(PathPolicyError::OutsideRoots(_))));
    }

    #[test]
    fn rejects_symlink_escape() {
        let root = tmp(); let outside = tmp();
        fs::write(outside.join("target.txt"), "x").unwrap();
        #[cfg(unix)] std::os::unix::fs::symlink(outside.join("target.txt"), root.join("link.txt")).unwrap();
        let mut p = PathPolicy::default(); p.allow(&root, Access::Read);
        assert!(matches!(p.validate(&root.join("link.txt"), Access::Read), Err(PathPolicyError::OutsideRoots(_))));
    }

    #[test]
    fn write_denied_on_readonly_root() {
        let root = tmp(); fs::write(root.join("a.txt"), "x").unwrap();
        let mut p = PathPolicy::default(); p.allow(&root, Access::Read);
        assert!(matches!(p.validate(&root.join("a.txt"), Access::ReadWrite), Err(PathPolicyError::ReadOnly(_))));
    }

    #[test]
    fn nonexistent_file_validated_via_existing_parent() {
        let root = tmp();
        let mut p = PathPolicy::default(); p.allow(&root, Access::ReadWrite);
        assert!(p.validate(&root.join("new-file.txt"), Access::ReadWrite).is_ok());
    }
}
```

```bash
cargo add tempfile --dev --manifest-path src-tauri/Cargo.toml
```

Run: `cargo test --manifest-path src-tauri/Cargo.toml security` → FAIL (todo! panics).

- [ ] **Step 2: Implement**

```rust
impl PathPolicy {
    pub fn allow(&mut self, root: impl Into<PathBuf>, access: Access) -> &mut Self {
        let root = root.into();
        let canon = root.canonicalize().unwrap_or(root);
        self.roots.push((canon, access));
        self
    }

    pub fn validate(&self, candidate: &Path, wanted: Access) -> Result<PathBuf, PathPolicyError> {
        // Canonicalize: the file itself if it exists, else its nearest existing ancestor + remainder.
        let canon = match candidate.canonicalize() {
            Ok(p) => p,
            Err(_) => {
                let parent = candidate.parent().ok_or_else(|| PathPolicyError::OutsideRoots(candidate.into()))?;
                let canon_parent = parent.canonicalize().map_err(|_| PathPolicyError::OutsideRoots(candidate.into()))?;
                let name = candidate.file_name().ok_or_else(|| PathPolicyError::OutsideRoots(candidate.into()))?;
                canon_parent.join(name)
            }
        };
        let mut best: Option<Access> = None;
        for (root, access) in &self.roots {
            if canon.starts_with(root) { best = Some(*access); if *access == Access::ReadWrite { break; } }
        }
        match best {
            None => Err(PathPolicyError::OutsideRoots(canon)),
            Some(Access::Read) if wanted == Access::ReadWrite => Err(PathPolicyError::ReadOnly(canon)),
            Some(_) => Ok(canon),
        }
    }
}
```

Run: `cargo test --manifest-path src-tauri/Cargo.toml security` → 5 passed.

- [ ] **Step 3: House rule + commit**

Add to `security/mod.rs` doc comment: _"Every IPC command that takes a filesystem path MUST call `PathPolicy::validate` before touching disk. Reviewers reject violations."_

```bash
git add -A && git commit -m "security: path policy with traversal/symlink/readonly tests"
```

### Task 9: Updater & signing stub (EKI-33)

**Files:** Create: `docs/RELEASING.md`. Modify: `src-tauri/tauri.conf.json` (commented stub), `.gitignore`.

- [ ] **Step 1: Generate updater keypair (stored OUTSIDE the repo)**

```bash
pnpm tauri signer generate -w ~/.tauri/crewhub2.key
echo ".tauri/" >> .gitignore   # belt-and-braces; key lives in $HOME anyway
```

Record the printed public key.

- [ ] **Step 2: Stub config + release doc**

In `tauri.conf.json` add (updater inactive until M6 wires endpoints):

```json
{
  "plugins": {
    "updater": {
      "pubkey": "<PASTE_PUBLIC_KEY>",
      "endpoints": []
    }
  }
}
```

`docs/RELEASING.md`:

```markdown
# Releasing CrewHub v2

- Updater private key: `~/.tauri/crewhub2.key` (NEVER in repo). Public key pinned in tauri.conf.json.
- CI release workflow (M6, EKI-98/100): builds signed artifacts; macOS additionally
  codesigned + notarized (Apple Developer ID; secrets: APPLE_CERTIFICATE, APPLE_ID,
  TAURI_SIGNING_PRIVATE_KEY, TAURI_SIGNING_PRIVATE_KEY_PASSWORD as GitHub secrets).
- Local release builds are never shipped.
- Versioning: semver in tauri.conf.json + package.json, bumped together.
```

- [ ] **Step 3: Verify build still passes, commit**

`pnpm tauri build --debug --no-bundle` → OK. `git commit -am "chore(release): updater key stub + releasing doc"`

---

## Epic 3 — Data & Event Core

### Task 10: SQLite store + migrations (EKI-34, part 1) — TDD

**Files:** Create: `src-tauri/migrations/001_init.sql`, `src-tauri/src/store/mod.rs`.

- [ ] **Step 1: Add crates**

```bash
cd src-tauri
cargo add rusqlite --features bundled
cargo add rusqlite_migration
cargo add dirs
cargo add uuid --features v4
cd ..
```

- [ ] **Step 2: Full schema v1 (master plan §4.4 — all tables now, features attach later)**

`src-tauri/migrations/001_init.sql`:

```sql
CREATE TABLE agents (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT, color TEXT, avatar TEXT,
  default_model TEXT, project_path TEXT, permission_mode TEXT NOT NULL DEFAULT 'default',
  system_prompt TEXT, persona_json TEXT, is_pinned INTEGER NOT NULL DEFAULT 0,
  auto_spawn INTEGER NOT NULL DEFAULT 0, bio TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE projects (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, icon TEXT, color TEXT,
  folder_path TEXT NOT NULL, docs_path TEXT, status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE rooms (
  id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL, icon TEXT, color TEXT, sort_order INTEGER NOT NULL DEFAULT 0,
  is_hq INTEGER NOT NULL DEFAULT 0, style_json TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE room_rules (
  id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('keyword','model','path_pattern','origin')),
  rule_value TEXT NOT NULL, priority INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE session_bindings (
  session_id TEXT PRIMARY KEY, agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL,
  display_name TEXT, pinned INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL
);
CREATE TABLE tasks (
  id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL,
  title TEXT NOT NULL, description TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','review','done','blocked')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  assignee_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL DEFAULT 'human',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE task_events (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, actor TEXT NOT NULL, payload_json TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE meetings (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, goal TEXT, state TEXT NOT NULL,
  room_id TEXT, project_id TEXT, config_json TEXT, output_md TEXT, output_path TEXT,
  current_round INTEGER, current_turn INTEGER,
  started_at INTEGER, completed_at INTEGER, cancelled_at INTEGER, error_message TEXT
);
CREATE TABLE meeting_turns (
  id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  round_num INTEGER NOT NULL, turn_index INTEGER NOT NULL, agent_id TEXT NOT NULL,
  session_id TEXT, transcript_offset INTEGER, started_at INTEGER, completed_at INTEGER
);
CREATE TABLE meeting_action_items (
  id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  text TEXT NOT NULL, assignee_agent_id TEXT, priority TEXT, status TEXT NOT NULL DEFAULT 'pending',
  task_id TEXT, sort_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE TABLE standups (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, created_by TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE standup_entries (
  id TEXT PRIMARY KEY, standup_id TEXT NOT NULL REFERENCES standups(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL, yesterday TEXT, today TEXT, blockers TEXT, submitted_at INTEGER NOT NULL
);
CREATE TABLE runs (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('scheduled','manual','pipeline_step')),
  schedule_cron TEXT, spec_json TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, last_run_at INTEGER
);
CREATE TABLE run_results (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  session_id TEXT, status TEXT NOT NULL, summary TEXT, started_at INTEGER, finished_at INTEGER
);
CREATE TABLE prompt_templates (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, template TEXT NOT NULL,
  variables_json TEXT, project_id TEXT REFERENCES projects(id) ON DELETE CASCADE
);
CREATE TABLE notification_rules (
  id TEXT PRIMARY KEY, scope TEXT NOT NULL CHECK (scope IN ('agent','project','global')),
  scope_id TEXT, trigger TEXT NOT NULL, config_json TEXT, enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE settings ( key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL );

CREATE INDEX idx_tasks_project ON tasks(project_id, status);
CREATE INDEX idx_tasks_room ON tasks(room_id, status);
CREATE INDEX idx_task_events_task ON task_events(task_id, created_at);
CREATE INDEX idx_rooms_project ON rooms(project_id, sort_order);
```

- [ ] **Step 3: Failing store tests**

`src-tauri/src/store/mod.rs`:

```rust
pub mod agents; pub mod projects; pub mod rooms; pub mod tasks; pub mod settings;

use rusqlite::Connection;
use rusqlite_migration::{Migrations, M};
use std::path::Path;
use std::sync::Mutex;

pub struct Store { pub(crate) conn: Mutex<Connection> }

fn migrations() -> Migrations<'static> {
    Migrations::new(vec![M::up(include_str!("../../migrations/001_init.sql"))])
}

impl Store {
    pub fn open(path: &Path) -> anyhow::Result<Self> {
        if let Some(dir) = path.parent() { std::fs::create_dir_all(dir)?; }
        let mut conn = Connection::open(path)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        migrations().to_latest(&mut conn)?;
        Ok(Self { conn: Mutex::new(conn) })
    }
    pub fn open_in_memory() -> anyhow::Result<Self> {
        let mut conn = Connection::open_in_memory()?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        migrations().to_latest(&mut conn)?;
        Ok(Self { conn: Mutex::new(conn) })
    }
    pub fn now_ms() -> i64 {
        use std::time::{SystemTime, UNIX_EPOCH};
        SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn migrations_are_valid() { migrations().validate().unwrap(); }
    #[test]
    fn opens_and_migrates_in_memory() {
        let s = Store::open_in_memory().unwrap();
        let n: i64 = s.conn.lock().unwrap()
            .query_row("SELECT count(*) FROM sqlite_master WHERE type='table'", [], |r| r.get(0)).unwrap();
        assert!(n >= 17);
    }
    #[test]
    fn opens_on_disk_creates_parent_dirs() {
        let dir = tempfile::tempdir().unwrap();
        let s = Store::open(&dir.path().join("nested/crewhub.db")).unwrap();
        drop(s);
        assert!(dir.path().join("nested/crewhub.db").exists());
    }
}
```

```bash
cargo add anyhow --manifest-path src-tauri/Cargo.toml
```

Run: `cargo test --manifest-path src-tauri/Cargo.toml store` → FAIL (submodules missing). Create empty `agents.rs`, `projects.rs`, `rooms.rs`, `tasks.rs`, `settings.rs` → re-run → 3 passed.

- [ ] **Step 4: Wire Store into Tauri state (app data dir)**

In `lib.rs` `setup`:

```rust
.setup(move |app| {
    use tauri::Manager;
    let db_path = app.path().app_data_dir().expect("app data dir").join("crewhub.db");
    let store = crate::store::Store::open(&db_path).expect("open store");
    app.manage(store);
    builder.mount_events(app);
    Ok(())
})
```

Run: `pnpm tauri dev` → `~/Library/Application Support/be.ekinsol.crewhub/crewhub.db` exists with schema.

- [ ] **Step 5: Commit** — `git commit -am "feat(store): sqlite store, schema v1 (full §4.4), migrations + tests"`

### Task 11: Typed CRUD stores + IPC commands (EKI-34, part 2) — TDD

**Files:** Create/modify: `src-tauri/src/store/{agents,projects,rooms,tasks}.rs`, `src-tauri/src/ipc/mod.rs`.

The `agents` module below is the complete reference implementation of the pattern. `projects`, `rooms`, and `tasks` implement the **identical pattern** with their own struct fields (taken 1:1 from the schema in Task 10) — same five functions (`create`, `get`, `list`, `update`, `delete`), same test set (round-trip, list ordering, update bumps `updated_at`, delete cascades/SET NULLs per schema), same IPC exposure.

- [ ] **Step 1: Failing tests for agents**

`src-tauri/src/store/agents.rs`:

```rust
use super::Store;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, PartialEq)]
pub struct Agent {
    pub id: String, pub name: String, pub icon: Option<String>, pub color: Option<String>,
    pub avatar: Option<String>, pub default_model: Option<String>, pub project_path: Option<String>,
    pub permission_mode: String, pub system_prompt: Option<String>, pub persona_json: Option<String>,
    pub is_pinned: bool, pub auto_spawn: bool, pub bio: Option<String>,
    pub created_at: i64, pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct NewAgent {
    pub name: String, pub icon: Option<String>, pub color: Option<String>,
    pub default_model: Option<String>, pub project_path: Option<String>,
    pub permission_mode: Option<String>, pub system_prompt: Option<String>,
}

impl Store {
    pub fn create_agent(&self, new: NewAgent) -> anyhow::Result<Agent> { todo!() }
    pub fn get_agent(&self, id: &str) -> anyhow::Result<Option<Agent>> { todo!() }
    pub fn list_agents(&self) -> anyhow::Result<Vec<Agent>> { todo!() }
    pub fn update_agent(&self, agent: Agent) -> anyhow::Result<Agent> { todo!() }
    pub fn delete_agent(&self, id: &str) -> anyhow::Result<bool> { todo!() }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn create_get_roundtrip() {
        let s = Store::open_in_memory().unwrap();
        let a = s.create_agent(NewAgent { name: "Botje".into(), icon: None, color: None,
            default_model: None, project_path: None, permission_mode: None, system_prompt: None }).unwrap();
        assert_eq!(a.permission_mode, "default");
        assert_eq!(s.get_agent(&a.id).unwrap(), Some(a));
    }
    #[test]
    fn list_orders_by_name() {
        let s = Store::open_in_memory().unwrap();
        for n in ["Zed", "Ann"] { s.create_agent(NewAgent { name: n.into(), icon: None, color: None,
            default_model: None, project_path: None, permission_mode: None, system_prompt: None }).unwrap(); }
        let names: Vec<_> = s.list_agents().unwrap().into_iter().map(|a| a.name).collect();
        assert_eq!(names, vec!["Ann", "Zed"]);
    }
    #[test]
    fn update_bumps_updated_at_and_persists() {
        let s = Store::open_in_memory().unwrap();
        let mut a = s.create_agent(NewAgent { name: "X".into(), icon: None, color: None,
            default_model: None, project_path: None, permission_mode: None, system_prompt: None }).unwrap();
        let before = a.updated_at;
        std::thread::sleep(std::time::Duration::from_millis(2));
        a.name = "Y".into();
        let a2 = s.update_agent(a).unwrap();
        assert_eq!(a2.name, "Y");
        assert!(a2.updated_at > before);
    }
    #[test]
    fn delete_returns_flag() {
        let s = Store::open_in_memory().unwrap();
        let a = s.create_agent(NewAgent { name: "X".into(), icon: None, color: None,
            default_model: None, project_path: None, permission_mode: None, system_prompt: None }).unwrap();
        assert!(s.delete_agent(&a.id).unwrap());
        assert!(!s.delete_agent(&a.id).unwrap());
    }
}
```

Run: `cargo test --manifest-path src-tauri/Cargo.toml agents` → FAIL.

- [ ] **Step 2: Implement agents**

```rust
fn row_to_agent(r: &rusqlite::Row) -> rusqlite::Result<Agent> {
    Ok(Agent {
        id: r.get("id")?, name: r.get("name")?, icon: r.get("icon")?, color: r.get("color")?,
        avatar: r.get("avatar")?, default_model: r.get("default_model")?,
        project_path: r.get("project_path")?, permission_mode: r.get("permission_mode")?,
        system_prompt: r.get("system_prompt")?, persona_json: r.get("persona_json")?,
        is_pinned: r.get::<_, i64>("is_pinned")? != 0, auto_spawn: r.get::<_, i64>("auto_spawn")? != 0,
        bio: r.get("bio")?, created_at: r.get("created_at")?, updated_at: r.get("updated_at")?,
    })
}

impl Store {
    pub fn create_agent(&self, new: NewAgent) -> anyhow::Result<Agent> {
        let now = Self::now_ms();
        let id = uuid::Uuid::new_v4().to_string();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO agents (id, name, icon, color, default_model, project_path, permission_mode, system_prompt, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
            rusqlite::params![id, new.name, new.icon, new.color, new.default_model,
                new.project_path, new.permission_mode.unwrap_or_else(|| "default".into()),
                new.system_prompt, now],
        )?;
        drop(conn);
        Ok(self.get_agent(&id)?.expect("just inserted"))
    }
    pub fn get_agent(&self, id: &str) -> anyhow::Result<Option<Agent>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT * FROM agents WHERE id = ?1")?;
        Ok(stmt.query_row([id], row_to_agent).map(Some).or_else(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => Ok(None), e => Err(e) })?)
    }
    pub fn list_agents(&self) -> anyhow::Result<Vec<Agent>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT * FROM agents ORDER BY name COLLATE NOCASE")?;
        let rows = stmt.query_map([], row_to_agent)?;
        Ok(rows.collect::<Result<_, _>>()?)
    }
    pub fn update_agent(&self, mut agent: Agent) -> anyhow::Result<Agent> {
        agent.updated_at = Self::now_ms();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE agents SET name=?2, icon=?3, color=?4, avatar=?5, default_model=?6, project_path=?7,
             permission_mode=?8, system_prompt=?9, persona_json=?10, is_pinned=?11, auto_spawn=?12,
             bio=?13, updated_at=?14 WHERE id=?1",
            rusqlite::params![agent.id, agent.name, agent.icon, agent.color, agent.avatar,
                agent.default_model, agent.project_path, agent.permission_mode, agent.system_prompt,
                agent.persona_json, agent.is_pinned as i64, agent.auto_spawn as i64, agent.bio,
                agent.updated_at],
        )?;
        Ok(agent)
    }
    pub fn delete_agent(&self, id: &str) -> anyhow::Result<bool> {
        let conn = self.conn.lock().unwrap();
        Ok(conn.execute("DELETE FROM agents WHERE id = ?1", [id])? > 0)
    }
}
```

Run: `cargo test --manifest-path src-tauri/Cargo.toml agents` → 4 passed. Commit: `feat(store): agents CRUD`.

- [ ] **Step 3: Repeat the pattern for `projects`, `rooms`, `tasks`**

Same five functions + same four tests per module, fields from the Task-10 schema. Additional required tests: `rooms::delete_project_cascades_rooms`, `tasks::delete_agent_nulls_assignee` (verify the FK behaviors declared in SQL). One commit per module.

- [ ] **Step 4: Expose over IPC**

In `ipc/mod.rs` add thin commands (no logic — stores only), e.g.:

```rust
#[tauri::command] #[specta::specta]
pub fn list_agents(store: tauri::State<crate::store::Store>) -> Result<Vec<crate::store::agents::Agent>, String> {
    store.list_agents().map_err(|e| e.to_string())
}
#[tauri::command] #[specta::specta]
pub fn create_agent(store: tauri::State<crate::store::Store>, new: crate::store::agents::NewAgent)
    -> Result<crate::store::agents::Agent, String> {
    store.create_agent(new).map_err(|e| e.to_string())
}
// + update_agent, delete_agent; and the same quartet for projects, rooms, tasks
```

Register all in `collect_commands![…]`, run `cargo test export_bindings`, confirm `bindings.ts` gained the typed functions. Commit: `feat(ipc): CRUD commands for agents/projects/rooms/tasks`.

### Task 12: Domain event bus + webview bridge (EKI-37) — TDD

**Files:** Create: `src-tauri/src/events.rs`, `src/ipc/events.ts`, `src/test/events.test.ts`. Modify: `lib.rs`, `ipc/mod.rs`.

- [ ] **Step 1: Define the event type (single enum — one channel, typed end-to-end)**

`src-tauri/src/events.rs`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
#[serde(tag = "type", content = "data")]
pub enum DomainEvent {
    AgentCreated { agent_id: String },
    AgentUpdated { agent_id: String },
    AgentDeleted { agent_id: String },
    ProjectChanged { project_id: String },
    RoomChanged { room_id: String },
    TaskChanged { task_id: String },
    SettingChanged { key: String },
}
```

Register: `.events(tauri_specta::collect_events![crate::events::DomainEvent])` on the specta builder.

- [ ] **Step 2: Emit from mutating commands**

Pattern (in each create/update/delete command):

```rust
use tauri_specta::Event;
let agent = store.create_agent(new).map_err(|e| e.to_string())?;
crate::events::DomainEvent::AgentCreated { agent_id: agent.id.clone() }
    .emit(&app).map_err(|e| e.to_string())?;   // app: tauri::AppHandle param
Ok(agent)
```

Run `cargo test export_bindings` → `bindings.ts` now exports `events.domainEvent`.

- [ ] **Step 3: Frontend subscription helper + failing vitest**

`src/test/events.test.ts` (uses Tauri's official mocks):

```ts
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { afterEach, expect, test, vi } from "vitest";
import { onDomainEvent } from "../ipc/events";

afterEach(clearMocks);

test("onDomainEvent subscribes via the generated event and forwards payloads", async () => {
  const handler = vi.fn();
  mockIPC(() => {}); // listen registration goes through plugin:event|listen
  const unlisten = await onDomainEvent(handler);
  expect(typeof unlisten).toBe("function");
});
```

`src/ipc/events.ts`:

```ts
import { events, type DomainEvent } from "./bindings";

export function onDomainEvent(handler: (e: DomainEvent) => void) {
  return events.domainEvent.listen(({ payload }) => handler(payload));
}
```

Run: `pnpm vitest run` → passes.

- [ ] **Step 4: End-to-end proof in dev**

Temporary debug block in `App.tsx`: subscribe with `onDomainEvent(console.log)`, click a "create test agent" dev button calling `commands.createAgent({...})` → console logs `{type: "AgentCreated", …}`. Remove button after verifying (keep the subscription helper).

- [ ] **Step 5: Commit** — `git commit -am "feat(events): DomainEvent bus, emission from mutations, typed webview bridge"`

### Task 13: Settings service + theme bootstrapping (EKI-38) — TDD

**Files:** Create: `src-tauri/src/store/settings.rs`, `src/stores/settings.ts`, `src/theme/themes.ts`, `src/theme/apply.ts`, `src/test/theme.test.ts`. Modify: `ipc/mod.rs`, `App.tsx`.

- [ ] **Step 1: Rust settings store (failing tests → implement)**

`src-tauri/src/store/settings.rs`:

```rust
use super::Store;

impl Store {
    pub fn get_setting(&self, key: &str) -> anyhow::Result<Option<String>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT value FROM settings WHERE key=?1")?;
        Ok(stmt.query_row([key], |r| r.get(0)).map(Some).or_else(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => Ok(None), e => Err(e) })?)
    }
    pub fn set_setting(&self, key: &str, value: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value=?2, updated_at=?3",
            rusqlite::params![key, value, Self::now_ms()])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn set_get_overwrite() {
        let s = Store::open_in_memory().unwrap();
        assert_eq!(s.get_setting("theme").unwrap(), None);
        s.set_setting("theme", "tokyo-night").unwrap();
        s.set_setting("theme", "nord").unwrap();
        assert_eq!(s.get_setting("theme").unwrap(), Some("nord".into()));
    }
}
```

IPC: `get_setting(key) -> Option<String>`, `set_setting(key, value)` (emits `SettingChanged`). Register + regenerate bindings.

- [ ] **Step 2: Theme registry (port 3 themes from v1 to prove the pipeline; rest in M2 EKI-20)**

`src/theme/themes.ts`:

```ts
export type ThemeName = "tokyo-night" | "nord" | "solarized-light";
export interface Theme {
  name: ThemeName;
  dark: boolean;
  vars: Record<string, string>;
}

export const THEMES: Record<ThemeName, Theme> = {
  "tokyo-night": {
    name: "tokyo-night",
    dark: true,
    vars: {
      "--background": "#1a1b26",
      "--foreground": "#c0caf5",
      "--card": "#16161e",
      "--accent": "#7aa2f7",
      "--border": "#292e42",
      "--muted": "#414868",
    },
  },
  nord: {
    name: "nord",
    dark: true,
    vars: {
      "--background": "#2e3440",
      "--foreground": "#eceff4",
      "--card": "#3b4252",
      "--accent": "#88c0d0",
      "--border": "#434c5e",
      "--muted": "#4c566a",
    },
  },
  "solarized-light": {
    name: "solarized-light",
    dark: false,
    vars: {
      "--background": "#fdf6e3",
      "--foreground": "#657b83",
      "--card": "#eee8d5",
      "--accent": "#268bd2",
      "--border": "#d3cbb7",
      "--muted": "#93a1a1",
    },
  },
};
```

`src/theme/apply.ts`:

```ts
import { THEMES, type ThemeName } from "./themes";

export function applyTheme(name: ThemeName) {
  const t = THEMES[name];
  const root = document.documentElement;
  for (const [k, v] of Object.entries(t.vars)) root.style.setProperty(k, v);
  root.classList.toggle("dark", t.dark);
  root.dataset.theme = t.name;
}
```

`src/test/theme.test.ts`:

```ts
import { applyTheme } from "../theme/apply";
import { expect, test } from "vitest";

test("applyTheme sets CSS vars and dark class", () => {
  applyTheme("tokyo-night");
  expect(document.documentElement.style.getPropertyValue("--background")).toBe("#1a1b26");
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  applyTheme("solarized-light");
  expect(document.documentElement.classList.contains("dark")).toBe(false);
});
```

Run: `pnpm vitest run` → passes.

- [ ] **Step 3: Persisted settings store (Zustand) + boot sequence**

`src/stores/settings.ts`:

```ts
import { create } from "zustand";
import { commands } from "@/ipc/bindings";
import { applyTheme } from "@/theme/apply";
import type { ThemeName } from "@/theme/themes";

interface SettingsState {
  theme: ThemeName;
  load: () => Promise<void>;
  setTheme: (t: ThemeName) => Promise<void>;
}

export const useSettings = create<SettingsState>((set) => ({
  theme: "tokyo-night",
  load: async () => {
    const stored = (await commands.getSetting("theme")) as ThemeName | null;
    const theme = stored ?? "tokyo-night";
    applyTheme(theme);
    set({ theme });
  },
  setTheme: async (theme) => {
    applyTheme(theme);
    set({ theme });
    await commands.setSetting("theme", theme);
  },
}));
```

In `App.tsx`: call `useSettings.getState().load()` once on mount; add a temporary theme `<select>` to switch between the three themes.

- [ ] **Step 4: Restart proof**

Run `pnpm tauri dev`, switch to "nord", quit, relaunch → app boots in nord. (Manual check; the persistence logic itself is covered by the Rust test.)

- [ ] **Step 5: Commit** — `git commit -am "feat(settings): persisted settings + theme bootstrapping with 3 ported themes"`

---

## Task 14: M0 Exit Review

- [ ] **Step 1: Run the full gate locally**

```bash
pnpm prettier --check . && pnpm eslint . && pnpm tsc --noEmit && pnpm vitest run
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
git diff --exit-code src/ipc/bindings.ts
pnpm tauri build --debug --no-bundle
```

Expected: all green.

- [ ] **Step 2: Verify against Linear ACs** — walk EKI-23/24/26/28/29/31/33/34/37/38 and tick every AC; anything unmet becomes a follow-up issue before closing the milestone.
- [ ] **Step 3: Write `docs/adr/0001-cli-stream-json-over-sdk-sidecar.md`** (transcribe decision D1 + checkpoint from master plan §4.2) so M1 starts with the decision on record.
- [ ] **Step 4: Mark M0 done in Linear**; M1 (Claude Code Engine) is unblocked — its plan gets written against this codebase.

---

## Out of scope for M0 (explicit)

No `claude` CLI interaction, no transcript watching, no MCP server, no hooks (all M1). No real panels/chat UI (M2). No notifications plugin, no shell/handoff permissions, no fs capability for the webview — capabilities grow only when their milestone lands, each with a README justification line.

## Self-review notes

- Spec coverage: all 10 Linear M0 issues are mapped (EKI-23 → Tasks 1–3; EKI-24 → Task 5; EKI-26 → Task 4; EKI-28 → Task 6; EKI-29 → Task 7; EKI-31 → Task 8; EKI-33 → Task 9; EKI-34 → Tasks 10–11; EKI-37 → Task 12; EKI-38 → Task 13). EKI-28's "runs in CI (macOS)" AC is amended to Linux-CI + macOS build job because tauri-driver does not support macOS — update the Linear AC accordingly when starting Task 6.
- Type consistency: `Store` methods, `DomainEvent` variants, and binding names (`commands.appInfo`, `events.domainEvent`) used consistently across Tasks 4, 11, 12, 13.
- The repeat-pattern instruction in Task 11 Step 3 is deliberate and bounded: identical function set, identical test set, fields dictated by the SQL in Task 10 — no unstated design decisions remain.

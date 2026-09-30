# Replace the CrewHub design system with the crewhub-loops design system

Date: 2026-09-30. Status: accepted by the user, ready for implementation.
Branch: `feat/loops-design-system` (worktree `/Users/ekinsol_nicky/Documents/GitHub/crewhub2-loops-ds`).
Delivery: a PR to `main`. Do not merge; the user reviews.

## Decision

The user wants the whole current design system in `apps/world` replaced by the
design system of the sibling repo `crewhub-loops` (path
`/Users/ekinsol_nicky/Documents/GitHub/crewhub-loops`, at commit `79ecfa0`).
That means all 2D UI elements and their styling: tokens, component kit, font,
theme handling, the old app stylesheet, and the docs that describe them.

The 3D scene (Three.js materials, lighting, robot colours in `apps/world/src/world`
and `components/WorldCanvas.tsx`) is *not* part of the UI palette and stays as it
is. Only its surrounding HTML UI changes.

Source of truth for the design system is the crewhub-loops artifact
<https://claude.ai/artifact/V7CyK4BpweSzBfbXzgWDU3> (namespace "Ekinsol"), which is
synced to `crewhub-loops/design/tokens.css` and `design/kit.css`. Its reuse rule:

> Reuse the primitives. Create variants, never new components. Five primitives
> cover the app: Button, Card, Menu, Chip, Field. A new need is first a variant
> (a modifier class on an existing primitive), and only when no primitive fits
> does a new one get added, with a card and a preview, before it appears in a screen.

## What comes in

| From crewhub-loops | Into crewhub2 | Rule |
| --- | --- | --- |
| `design/tokens.css` | `apps/world/src/styles/tokens.css` | Verbatim copy. Same variable names (`--bg`, `--surface`, `--text`, `--accent`, ...), same `data-theme` attribute on `<html>`. Add one header line recording the source path and commit. |
| `design/kit.css` | `apps/world/src/styles/kit.css` | Verbatim copy, whole file, even the parts crewhub2 does not use yet. Portability between the repos matters more than a few unused rules. |
| `@fontsource-variable/archivo` | `apps/world/package.json` dependency, imported once in `main.tsx` | Replaces Inter and Georgia. |
| `apps/web/src/components/primitives/{Button,Card,Chip,Field,Menu}.tsx` + `cx.ts` | `apps/world/src/components/primitives/` | Port. Button loses its react-router `to` branch (crewhub2 has no router); keep `href`. Everything else stays as close to the source as possible. Port Menu only if the app needs a menu; otherwise leave it out and say so in the docs. |
| `apps/web/src/state/theme.tsx` | `apps/world/src/state/theme.tsx` | Simplified port: `system | light | dark`, stored in `localStorage` under `crewhub-theme`, applied as `data-theme` on `<html>`, no server round trip. |
| Status shapes | Lucide icons | Keep `lucide-react` (already a dependency). Every status keeps a distinct icon shape next to its colour, as in loops. |

Keep the loops names everywhere. Do not rename `--bg` to `--ch-bg` or similar;
the point is that code moves between the two repos without translation.

## What goes out

- `apps/world/src/design-system/` entirely: `tokens.css`, `components.tsx`,
  `components.css`, `DesignSystem.tsx`, `showcase.css`.
- The `/design-system` route in `main.tsx`. There is no showcase page any more;
  the artifact is the reference.
- `apps/world/public/design-system/town-reference.png` (the reference image of
  the old system; it stays in Git history).
- `scripts/check-design-system.mjs` in its current form (it parses `--ch-`
  tokens under `data-crew-theme`). Replace it, see "Checks".
- All 182 hex colour literals in `apps/world/src/styles.css`, and that file's
  Inter font stack, 13px base and green palette.

## The app stylesheet

`apps/world/src/styles.css` (1680 lines, 74 classes, used by `App.tsx`) is
rewritten, not patched:

1. Where the kit has a class, use the kit class in `App.tsx` and delete the
   local rule: `.btn`/`.btn-primary`/`.btn-ghost`/`.btn-icon`, `.card`, `.chip`
   with `data-status`, `.field`/`.input`/`.select`, `.toast`/`.toast-region`,
   `.eyebrow`, `.empty`, `.kbd`, `.menu`, `.sr-only`, `.skip-link`, `.tabs`.
2. What remains is layout that is specific to the world view (scene stage,
   side rail, floating panels over the canvas, help dialog, mobile crew
   toggle, prop palette). Move it to `apps/world/src/styles/world.css`, written
   only with tokens: no hex, no rgb(), no hard-coded font families or sizes.
   Prefix nothing; use plain descriptive class names as loops does.
3. Every colour, radius, shadow, spacing and font value comes from
   `tokens.css`. This is the same rule as loops' AGENTS.md: "Colours only
   through tokens.css variables; no hex outside it."
4. Status mapping from CrewHub session states to loops tokens:
   working → `progress` (tangerine family), needs input → `attention`
   (coral family; the one that reads as "waiting on you"), completed → `done`,
   disconnected/stale → `stalled`, idle → `planned`. Adjust if a state has no
   sensible match, and write the final table into `docs/DESIGN_SYSTEM.md`.
5. `index.html`: `<meta name="theme-color">` may not keep a hex literal. Set it
   from the computed `--bg` after the theme is applied, or drop it.

Keep the accessibility behaviour that exists today: keyboard access, visible
focus (the kit's `:focus-visible` ring), text status next to colour, reduced
motion, touch targets of 40px on coarse pointers (the kit does this).

## Checks

Replace `scripts/check-design-system.mjs` (keep the npm script name
`check:design`, it is part of `npm run check`) with two deterministic checks:

1. Hex guard: no `#[0-9a-fA-F]{3,8}\b` in `apps/world/src/**/*.{css,ts,tsx}` and
   `apps/world/index.html`, except `apps/world/src/styles/tokens.css`. Mirror
   the regex and paths of `crewhub-loops/scripts/check.sh`. Exclude the 3D
   scene files only if they hold material colours, and list them explicitly.
2. Token parity: in `tokens.css` the `@media (prefers-color-scheme: dark)`
   block and the `:root[data-theme="dark"]` block declare identical variables
   with identical values (the file's own comment demands this).

The old contrast computation is dropped: loops records contrast ratios in the
tokens header and its colours are `color-mix()` values that a plain script
cannot evaluate. Say so in the docs.

## Docs

- `docs/DESIGN_SYSTEM.md`: rewrite. Source and sync rule (artifact → loops
  `design/` → this repo, copied verbatim, with the loops commit recorded),
  palette and semantic aliases, the five primitives and the reuse rule, theme
  handling, the status mapping table, the hex rule, the check script, and what
  is deliberately not ported.
- `docs/decisions/0004-loops-design-system.md`: short ADR. Context (two
  ekinsol products, one design language), decision, consequences (scene
  materials independent; no showcase page; colours only via tokens).
- `AGENTS.md`: the paragraph about the "reference-based light and dark
  design-system draft" becomes a pointer to the new `DESIGN_SYSTEM.md` and
  the hex rule.
- `docs/VISUAL_DIRECTION.md`: remove "Georgia headings", the "neutral
  system-sans UI" and the green/graphite review notes; state Archivo, the
  ekinsol palette, and that the botanical scene keeps its own materials.
- Touch `README.md`, `docs/README.md`, `docs/ROADMAP.md`, `docs/TOWN_PLAN.md`,
  `docs/ASTRA_HANDOFF.md` only where they mention the v0.1 kit or the
  showcase route.

All text in English.

## Verification

- `npm run check` green (typecheck, tests, docs check, design check, build).
- Open the app in a real browser at a desktop width and at 375px, in light
  and in dark, and look at: the side rail, a selected crew card, every status
  chip, a toast, the help dialog, the scenario controls, focus rings via Tab.
  Take screenshots into the scratchpad and mention their paths in the report.
- Confirm the 3D scene renders unchanged.
- Report honestly what was not visually verified.

## Out of scope

- Any change to `packages/*`, `apps/bridge`, the grid engine or the 3D scene.
- New features or layout redesigns beyond what the kit imposes.
- A showcase or documentation page inside the app.
- Adding a router, vitest, testing-library or Playwright. Component tests from
  loops are not ported; `npm run check` and the browser pass are the gate.

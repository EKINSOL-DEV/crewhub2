# CrewHub design system

Status: the crewhub-loops design system is adopted for all 2D UI in `apps/world`.
Visual review of the migrated room is pending the user's PR review. The decision
is recorded in [0004](decisions/0004-loops-design-system.md), and the accepted
[migration spec](superpowers/specs/2026-09-30-loops-design-system-design.md) lists
what was brought in, removed and checked. The 3D scene is not
part of this system.

## Source and sync rule

The design system is shared with the sibling product crewhub-loops. Its source of
truth is the artifact <https://claude.ai/artifact/V7CyK4BpweSzBfbXzgWDU3>
(namespace "Ekinsol"). Changes flow one way:

1. Change the artifact.
2. Sync it to crewhub-loops `design/tokens.css` and `design/kit.css`.
3. Copy both files verbatim into this repository and record the crewhub-loops
   commit in the header line of each copy.

Never edit the copies here. The current copies come from crewhub-loops commit
`79ecfa0`.

### The chat bubbles follow the same rule

The chat dock and chat card are the loops chat itself (plan section 4.7, item 1).
These files are verbatim copies of crewhub-loops at commit `a1bed0f`, each with one
header line that names its source and the commit:

| Copy | Source in crewhub-loops |
| --- | --- |
| [Bubbles.tsx](../apps/world/src/components/bubbles/Bubbles.tsx) | `apps/web/src/components/bubbles/Bubbles.tsx` |
| [queries.ts](../apps/world/src/components/bubbles/queries.ts) | `apps/web/src/components/bubbles/queries.ts` |
| [useMessageViewport.ts](../apps/world/src/components/bubbles/useMessageViewport.ts) | `apps/web/src/components/bubbles/useMessageViewport.ts` |
| [bubbles.css](../apps/world/src/components/bubbles/bubbles.css) | `apps/web/src/components/bubbles/bubbles.css` |
| [primitives/Menu.tsx](../apps/world/src/components/primitives/Menu.tsx) | `apps/web/src/components/primitives/Menu.tsx` |

To change the chat, change crewhub-loops, then copy the file again with a new
header line. `npm run check:copy`
([check-bubbles-copy.ts](../scripts/check-bubbles-copy.ts)) fails when a copy
differs from its source at the recorded commit. It needs a crewhub-loops checkout
(`CREWHUB_LOOPS_DIR`, or the sibling directory `../crewhub-loops`); without one, or
without the commit, it prints that it skipped and passes.

The two loops tests next to the chat, `drafts.test.tsx` and `events.test.ts`, are
**not** copied. They run on vitest and Testing Library and import loops'
`state/events`, none of which this repository has. The behaviour they pin stays
tested in crewhub-loops.

Everything the copies import is provided at the same relative path by a small
adapter in this repository, never by editing a copy:

| Import in the copy | Adapter here |
| --- | --- |
| `../../api/client` | [api/client.ts](../apps/world/src/api/client.ts): `ApiError` and `shouldRetry` from loops; `api` answers from the in-browser demo API (`packages/demo` `createDemoApi`), never `fetch` |
| `../../api/types` | [api/types.ts](../apps/world/src/api/types.ts): loops-client types, plus the web-only chat contracts copied from loops |
| `../../i18n` | [i18n/](../apps/world/src/i18n/index.ts): `useT` over the English strings the chat uses, copied from loops |
| `../../state/session` | [state/session.ts](../apps/world/src/state/session.ts): the demo person Nicky, an admin |
| `../board/format` | [board/format.ts](../apps/world/src/components/board/format.ts): `timeAgo`, copied |
| `../Avatar`, `../Icon` | [Avatar.tsx](../apps/world/src/components/Avatar.tsx), [Icon.tsx](../apps/world/src/components/Icon.tsx): ported; the sprite has only the icons the chat uses |
| `../primitives` | `Chip.Person`, `Chip.Link` and `Chip.Delivery` added to the world's Chip; Menu copied |
| `react-router-dom` | [shims/react-router-dom.ts](../apps/world/src/shims/react-router-dom.ts), through a Vite alias and a tsconfig path: `useNavigate` to `/settings/agents` opens the world's Settings card |

One layout rule for the chat lives in `world.css`, outside the copies: the chat
header's "…" menu opens leftwards, because the copy opens it off the right edge of
the viewport (the same happens in crewhub-loops; fix it there, then drop the rule).

## Files

| File | Responsibility |
| --- | --- |
| [tokens.css](../apps/world/src/styles/tokens.css) | Verbatim copy: raw palette, semantic aliases, type, spacing, light and dark values. The only file that may contain hex colours |
| [kit.css](../apps/world/src/styles/kit.css) | Verbatim copy: class-based components on top of the tokens (`.btn`, `.chip`, `.card`, field classes, focus, reduced motion, touch sizes) |
| [world.css](../apps/world/src/styles/world.css) | CrewHub only: world-view layout (scene stage, side rail, floating panels over the canvas, help dialog, mobile crew toggle, prop palette). Uses tokens only |
| [primitives/](../apps/world/src/components/primitives/index.ts) | React wrappers over the kit classes |
| [theme.tsx](../apps/world/src/state/theme.tsx) | Theme preference and `data-theme` handling |
| [check-design-system.mjs](../scripts/check-design-system.mjs) | Hex guard and dark-token parity check |

Import order in `apps/world/src/main.tsx`: the Archivo font, `tokens.css`,
`kit.css`, `world.css`.

## Font

Archivo Variable, from the npm package `@fontsource-variable/archivo`. It replaces
Inter and Georgia. Mono text uses `--font-mono`.

## Palette and semantic aliases

The palette matches the Ekinsol website: ink, ink-soft and ink-card (dark
surfaces), paper (light surface), mist, mist-dark and mist-text (greys), coral and
coral-text (the one accent), tangerine (progress and warm states) and circle.
Tints and shades are `color-mix()` values of palette colours only. No colour exists
outside the palette.

Components use the semantic aliases, never the raw palette. The aliases used
most:

- Surfaces: `--bg`, `--surface`, `--surface-sunken`, `--surface-raised`.
- Text: `--text`, `--text-muted`, `--text-subtle`, `--on-primary`, `--on-accent`.
- Accent: `--accent`, `--accent-text` (small accent text, links), `--accent-soft`,
  `--accent-strong`.
- Edges: `--border`, `--border-strong` (dividers and tracks only),
  `--border-input` (the edge of a field).
- Focus: `--focus`.
- Status: `--status-progress`, `--status-done`, `--status-planned`,
  `--status-stalled`, `--status-attention`, `--status-waiting-human`, each with a
  `-soft` tint where the kit defines one.

The header of `tokens.css` records the contrast ratios for text, focus, status
and field edges in both themes. Raw coral, tangerine, mist-text, coral-text and
circle fail 4.5:1 as small text on paper; the kit uses them only as fills, icons,
dots or large type.

## Primitives and the reuse rule

Quoted from crewhub-loops:

> Reuse the primitives. Create variants, never new components. Five primitives
> cover the app: Button, Card, Menu, Chip, Field. A new need is first a variant
> (a modifier class on an existing primitive), and only when no primitive fits
> does a new one get added, with a card and a preview, before it appears in a screen.

Ported to [primitives/](../apps/world/src/components/primitives/index.ts):

| Primitive | Notes |
| --- | --- |
| Button | No router `to` prop; `href` is kept |
| Card | As in loops |
| Chip | Base chip, `Chip.Status`, `Chip.Stalled`, `Chip.Attention`, and for the chat `Chip.Person`, `Chip.Link` (no router `to`) and `Chip.Delivery` |
| Field | As in loops |
| Menu | Verbatim copy (see "The chat bubbles follow the same rule") |

Screens compose these primitives; a new need is a variant first.

## Theme

`apps/world/src/state/theme.tsx` holds a preference of `system`, `light` or
`dark`.

- Stored in `localStorage` under `crewhub-theme`, in this browser only. There is
  no server round trip.
- Applied as `data-theme` on `<html>`. `system` follows `prefers-color-scheme`.
- `<meta name="theme-color">` is set from the resolved `--bg`, written as `rgb()`
  because the token may be a `color-mix()`.
- A theme toggle Button in the app header cycles system, light, dark.

## Status mapping

CrewHub session states map to kit statuses. Each row has its own icon shape and a
text label, so colour is never the only cue.

| Session state | UI label | Kit | Primitive | Icon (lucide) |
| --- | --- | --- | --- | --- |
| `working` | In the flow | `progress` (tangerine) | `Chip.Status value="progress"` | `Contrast` (half circle) |
| `needs-input` | Needs you | attention (coral, "waiting on you") | `Chip.Attention` | `CircleAlert` |
| `completed` | All wrapped up | `done` | `Chip.Status value="done"` | `CircleCheck` |
| `idle` | Taking a breath | `planned` | `Chip.Status value="planned"` | `Circle` |
| `unknown` | Status unknown | stalled | `Chip.Stalled` | `Clock` |
| any, while disconnected | Last known: … | stalled | `Chip.Stalled` | `Clock` |

## Colour rule and checks

Rule: colours enter the UI only through `tokens.css` variables. No hex colour
appears outside `tokens.css`. The exceptions are the 3D scene material files
`apps/world/src/world/{Scene,models,shaders,data}.ts`, which are not UI palette.

`npm run check:design` runs [check-design-system.mjs](../scripts/check-design-system.mjs):

1. Hex guard: no `#[0-9a-fA-F]{3,8}\b` in `apps/world/src/**/*.{css,ts,tsx}` or
   `apps/world/index.html`, except `tokens.css` and the scene files above (listed
   explicitly in the script).
2. Dark-token parity: the `prefers-color-scheme: dark` block and
   `:root[data-theme="dark"]` in `tokens.css` declare the same tokens with
   identical values.

The script does not compute contrast. loops records the ratios in the `tokens.css`
header, and its colours are `color-mix()` values that a plain script cannot
evaluate.

## Accessibility carried over

Implemented in `kit.css`:

- A `:focus-visible` ring using `--focus`.
- Reduced-motion rules under `prefers-reduced-motion: reduce`.
- 40px touch targets on coarse pointers (`--control-h-touch`).

Rules for new UI: status always has text next to colour, every control is keyboard
reachable, and the 3D view keeps a useful fallback when graphics are unsupported.

## The 3D scene

Three.js materials, lighting and robot colours in `apps/world/src/world/` and
[WorldCanvas.tsx](../apps/world/src/components/WorldCanvas.tsx) are independent of
the UI palette and unchanged. See [VISUAL_DIRECTION.md](VISUAL_DIRECTION.md).

## Removed and not ported

- Removed: `apps/world/src/design-system/` (tokens, components, showcase), the
  `/design-system` route, and `apps/world/public/design-system/town-reference.png`
  (still in Git history). The old v0.1 kit was replaced by the crewhub-loops design
  system.
- No showcase page in the app. The artifact is the reference.
- Not ported: the loops ticket chips (Priority, Label, Waiting, Blocked, Progress)
  and the loops component tests.

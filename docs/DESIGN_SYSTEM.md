# CrewHub design system

Status: v0.1 implemented as a reference-based component kit and interactive field
guide; final visual acceptance is pending. The user requested light and dark modes
from a supplied town image. This is the design-system workstream described in
[TOWN_PLAN.md](TOWN_PLAN.md), not implementation of the town or runtime adapters.

Open <http://127.0.0.1:5173/design-system> after `npm run dev`. The Greenhouse remains
at `/`. The guide and its styles load separately from the current room.

## Direction

The reference combines botanical miniature architecture with a restrained product
interface: chalk walls, warm timber, framed glass, planted paths, soft robots,
orthographic views, and quiet floating panels. Use these relationships rather than
copying text or treating the reference's activity as live data.

- Let the world occupy the visual center. Place navigation at its edges.
- Use warm neutral surfaces, crisp content, thin borders, and subtle elevation.
- Reserve strong color for action, selection, or meaningful state.
- Keep character appearance separate from runtime, connection, and task state.
- Use familiar interface typography. Let materials and characters supply warmth.
- Dark mode changes the lighting and surface hierarchy while retaining identity.

Review update: the user requested removal of the thick left selection edge and
green UI tints. The kit now uses warm neutral surfaces, graphite actions, slate
working status, and a stone-colored Moss avatar. Selected cards use an even 1px
border and a quiet neutral fill. Botanical scene materials remain independent of
the UI palette.

The [original reference](../apps/world/public/design-system/town-reference.png)
was supplied by the user on 2026-09-13. It is retained without alteration for design
review, not represented as a product screenshot or a CrewHub implementation. Its
upstream creator/license was not supplied; this file is a reference, not a new
claim of asset ownership. The guide's vector material study is authored in code.
All other UI uses local CSS, existing Lucide icons, and system fonts.

## Source of truth

| File | Responsibility |
| --- | --- |
| [tokens.css](../apps/world/src/design-system/tokens.css) | Shared dimensions and semantic light/dark values |
| [components.tsx](../apps/world/src/design-system/components.tsx) | Buttons, icon buttons, panels, statuses, source badges, avatars, agent cards and notices |
| [components.css](../apps/world/src/design-system/components.css) | Reusable component, field, and focus styles |
| [DesignSystem.tsx](../apps/world/src/design-system/DesignSystem.tsx) | Interactive guide, specimens, theme preference and token export |
| [showcase.css](../apps/world/src/design-system/showcase.css) | Guide layout, responsive examples and material study presentation |
| [check-design-system.mjs](../scripts/check-design-system.mjs) | Matching theme keys and contrast checks against exported tokens |

Tokens are scoped by `data-crew-theme="light"` or `data-crew-theme="dark"` and use
the `--ch-` prefix. Components use `ch-`; guide-only classes use `ds-`. Do not use
guide layout classes in production features. No new dependency or provider is
required. The current renderer and old app stylesheet have not been migrated.

## Color and theme

| Role | Light: Daylight | Dark: Lamplight |
| --- | --- | --- |
| Canvas | `#F5F3EF` warm paper | `#1C1B1A` charcoal |
| Surface | `#FFFDFA` chalk | `#272523` raised charcoal |
| Muted surface | `#EEEBE6` stone | `#302D2A` warm gray |
| Primary ink | `#292725` | `#F3F0EC` |
| Secondary ink | `#605C57` | `#C9C2B9` |
| Muted ink | `#68635D` | `#B8AFA5` |
| Accent | `#44413E` graphite | `#D6D1CA` pale stone |
| Selection | `#EAE6E0` | `#403B35` |
| Attention ink | `#805715` amber | `#EDC37E` lamplight |
| Completion ink | `#615184` lilac | `#CFBDE9` soft lavender |
| Failure ink | `#A04034` clay | `#F0AA98` warm coral |

Use semantic pairs, such as `--ch-attention` on `--ch-attention-bg`, rather than
substituting an unrelated pale color. `--ch-border` separates content; it is not a
control boundary. Inputs and outlined buttons use `--ch-border-control`. Keep
primary-button text on `--ch-on-accent`, not ordinary ink.

The guide offers Light, Dark, and System. A choice persists in browser storage
under `crewhub.design-system.theme`. System follows the OS, including changes
while the page is open. When storage is unavailable, the control still works for
the visit. Nested previews explicitly set their own theme. Theme switching has no
animation or inference cost.

Opaque panels are the default. Floating chrome may use the nearly opaque
`--ch-glass` with a 16px backdrop blur. Never rely on blur for legibility. Avoid
large dark shadows in light mode and bright glowing borders in dark mode.

## Typography, spacing, shape

Use the system sans stack; Inter is used only if installed. No font service is
contacted. This is intentionally more neutral than the Greenhouse's existing
Georgia headings, which remain in the original room until an explicit migration.

| Role | Size and treatment |
| --- | --- |
| Display | 36–56px, 1.1 line height, medium weight, modest negative tracking |
| Section title | 24px, medium weight |
| Panel title | 16px, medium or semibold |
| Body | 14px, 1.5–1.8 line height |
| Secondary/control | 12–13px; preserve contrast |
| Task/code | 12px system monospace |

Guide annotations can be smaller than product content. Essential status, help,
and action text should remain at least 12px when applying the kit to product
features. Use sentence case. Write specific actions: “View activity,” “Assign
room,” or “Reconnect.” Do not invent progress, tool results, or supported controls.

The spacing scale is 4, 8, 12, 16, 20, 24, 32, 48, and 64px. Default panel padding
is 24px. Controls target 44px. Radii are 8px for controls, 12px for cards, 18px for
panels, and 24px for large compositions. Pills belong to short status labels.

Use 1px borders, three restrained elevation tokens, and a 2px focus ring offset
by 4px. Keep Lucide icons at 14–20px with a consistent 1.65px stroke. An icon-only
button needs an accessible name, a tooltip, and a full control-sized hit area.

## Component contracts

| Component/pattern | Contract |
| --- | --- |
| `Button` | Primary, secondary, ghost and danger. Native disabled behavior. One primary action per context. Defaults to `type="button"`; opt into submit explicitly. |
| `IconButton` | Required `label`; provides accessible name and tooltip. |
| `Panel` | A semantic section with solid themed surface and quiet elevation. Label its content with a heading. |
| `StatusBadge` | Icon, text and tone together. The component does not infer runtime state. |
| `SourceBadge` | Names origin/route independently of activity; optional disconnected icon. |
| `RobotAvatar` | Decorative, hidden from accessibility tree. Stone, clay and lavender are character identities. Pair with the visible name. |
| `AgentCard` | Named selection control with explicit pressed state, a neutral fill and an even 1px border. No thick left edge. Identity and state are separate props. |
| `Notice` | In-context explanation with a clear title; optional action. Static notices do not announce themselves as new alerts. |
| Field | Native label, help text, semantic boundary. Use `aria-invalid` and associated error text together. |
| Dialog | Native modal dialog, accessible title, focus containment, Escape dismissal and focus restoration. |
| Toolbar | Named group of ordinary buttons, each with clear selected state. Use `role="toolbar"` only when also implementing its arrow-key behavior. |

The guide includes functioning selection, activity disclosure, theme controls,
token copy/export, a dialog, validation, notifications and a motion specimen.
Town actions are labeled previews. There is no live room creation, session
assignment, deletion, prompt submission or provider connection.

```tsx
import { Button, Panel, StatusBadge } from "./design-system/components";

<div data-crew-theme="dark">
  <Panel aria-labelledby="agent-heading">
    <h2 id="agent-heading">Moss</h2>
    <StatusBadge status="working" />
    <Button onClick={openActivity}>View activity</Button>
  </Panel>
</div>
```

For reusable form styles, apply `ch-field`, `ch-input`, `ch-field-hint`, and
`ch-field-error`. Importing the components also imports the token and component
styles. Scope the theme at the feature shell. Resolve the actual user preference
in the product shell during migration; do not couple product features to the guide.

## State and town patterns

Working uses slate; input/approval use amber; explicit completion uses lilac;
failure uses clay. Idle, unknown and disconnected are neutral but have distinct
icons and words. “Finished unseen” is an attention label, not proof of success.
Use `stale` alongside the last known execution state and a timestamp. Do not
flatten separate runtime dimensions into one badge; this kit does not change the
mock protocol or implement M2 identity reconciliation.

Room summaries need activity counts and freshness. Distinguish a known empty room
from missing information. Unknown project identity goes into an unassigned state.
Full-room notices explain capacity choices before growth, rather than silently
moving neighbors. Provider labels do not dictate room ownership. The same future
canonical session may display several observation sources and one character.

At narrow widths, use a navigation drawer and stack cards. Preserve status labels
and action names; reduce ornament first. The guide collapses navigation below
700px and stacks most specimens below 960px. The future world layout should use
its own content-driven breakpoints with the same spacing and control tokens.

## World and motion

The scene palette includes foliage, ground, wall, wood, water and light tokens. These drive
the guide's vector material study. Applying them to Three.js requires a separate
lighting/material pass; CSS alone does not implement a dark 3D scene.

Daylight uses a soft sky, pale chalk and sage planting. Lamplight uses darker
ambient greens, warm windows, restrained lamps and readable character silhouettes.
Do not darken the entire canvas with an overlay or change collision geometry to
match an asset. Preserve the separate town/interior grids and orthographic camera.

Hover response is 120ms, panels 180ms, and proposed camera easing 320ms, using
`cubic-bezier(0.2, 0.7, 0.2, 1)`. Respond, then settle. Avoid perpetual pulses and
unnecessary spinners. All motion is ordinary code. `prefers-reduced-motion` zeros
the timing tokens and removes the specimen's displacement. The guide's checkbox
can further reduce motion; it cannot override the OS preference to add motion.

## Verification

Run `npm run check`; it includes the existing engine tests and the new
`npm run check:design`. The latter verifies matching theme keys and 56 actual
contrast pairs: body text at least 4.5:1, controls/focus at least 3:1. The lowest
tested text pair is 4.65:1. This is token-level evidence, not a blanket accessibility
certification of every possible composition or image backdrop.

Browser review on 2026-09-13 used Chrome on the local Mac, at the normal desktop
viewport and a 390 × 844 viewport override. Screenshots were inspected during the
session. A further 320px-wide DOM check found no horizontal overflow.

| Check | Result |
| --- | --- |
| Light and dark | Rendered and inspected at desktop and phone-sized viewports |
| Theme preference | Light and dark each survived reload; System initially matched the current dark OS preference |
| Selection/disclosure | Selecting Pip changed the light specimen's task, provider and status; sample activity expanded |
| Keyboard/dialog | Visible focus ring; named modal; Escape closed it and restored the trigger's focus |
| Form | Empty name produced associated error text; valid input cleared it and showed a preview notification |
| Mobile navigation | Drawer opened and closed after selecting a section |
| Gentle motion | Checkbox changed the movement specimen's state; the OS override is implemented in CSS but OS settings were not changed for this review |
| Token export | Browser saved `crewhub-tokens.css`; byte comparison matched the source token file |
| Console | No captured warnings or errors in the design-system page |
| Room regression | The existing Greenhouse rendered after following the guide's link; its original styles remained scoped to that page |

Actual touch hardware, screen-reader speech output, OS theme changes while open,
and full 3D night lighting require separate review. The existing build warning for
the large Three.js chunk remains; the guide loads in a separate lazy chunk.

Next: review this kit visually, then apply its components incrementally as town
features are assigned. M2 remains the next model milestone. Preserve the working
room and keep runtime integrations outside presentation code.

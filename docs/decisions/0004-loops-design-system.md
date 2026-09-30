# 0004: One design language for Ekinsol products: the crewhub-loops design system

Status: accepted; implemented on the design-system branch, visual review pending.

CrewHub and crewhub-loops are two Ekinsol products. CrewHub had its own
reference-based v0.1 kit, while crewhub-loops already uses the Ekinsol palette and
Archivo through a maintained design system. Two languages would drift.

All 2D UI in `apps/world` now uses the crewhub-loops design system: its tokens,
its kit, the Archivo font, its `data-theme` handling and its reuse rule (variants
of five primitives, not new components). The artifact
<https://claude.ai/artifact/V7CyK4BpweSzBfbXzgWDU3> is the source. `tokens.css` and
`kit.css` are copied verbatim from crewhub-loops `design/` (commit `79ecfa0`) into
`apps/world/src/styles/`. The old design system and its `/design-system` showcase
are removed. See [DESIGN_SYSTEM.md](../DESIGN_SYSTEM.md).

Consequences:

- The 3D scene materials, lighting and robot colours stay independent of the UI
  palette. The Greenhouse art direction is unchanged.
- There is no showcase page in the app. The artifact is the reference.
- Colours enter the UI only through `tokens.css` variables. `npm run check:design`
  rejects hex colours elsewhere, except the listed scene files.
- The copies must stay verbatim. A change is made in the source and re-synced from
  crewhub-loops, with the new commit recorded in each header line.
- Menu and the loops ticket chips are not ported until a need appears.

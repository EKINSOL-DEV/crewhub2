# Visual direction

## Intent

Create a place someone wants to keep open while their agents work. Aim for a
cohesive, crafted miniature world with expressive inhabitants and tactile
interaction. Choose a strong art direction and carry it through geometry,
materials, lighting, motion, interface, typography, and sound if later added.

Astra has creative freedom. The old world and its assets are not design constraints.
The first implemented world style is Greenhouse: an ivory and sage miniature studio,
warm timber, glass architecture, botanical details, and soft robots in sage,
apricot, and lavender. It is a style, one swappable package behind a seam, not the
product; see [WORLD_STYLES.md](WORLD_STYLES.md). The world itself is a town of
buildings, one per crewhub-loops project, with rooms by role.
The orthographic isometric home keeps spatial relationships stable; free orbit,
focus, and automatic wall fading provide visibility when needed.

## Scenes and interface

2D UI uses the crewhub-loops design system: Archivo and the Ekinsol palette, in
light and dark. [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) records it. The botanical
scene keeps its own materials and lighting, independent of the UI palette.

- Every room has distinguishable characters and meaningful places for them to
  work, wait, and present a result.
- A clear overview camera and a satisfying focus/return interaction. Motion must
  remain interruptible, avoid occlusion, and keep the selected character visible.
- A restrained interface that appears when useful. Put activity, selection, and
  results in context; avoid filling the scene with permanent labels and controls.
- A compact way to run deterministic demonstration scenarios, visibly labeled
  as simulated. The live integration must be replaceable at the data boundary.

## State expressed through behavior

| Meaning | Possible visual expression | Required truthfulness |
| --- | --- | --- |
| Idle | Relaxed posture or small idle action | No claim that work is happening |
| Working | Focused movement at a work surface | Describe only known activity |
| Needs input | Turning toward the viewer or a raised hand | Provide a readable attention label |
| Completed | A result placed nearby and a short celebration | Trigger only on explicit completion evidence |
| Disconnected | A quiet connection indicator | Preserve the last known state as stale |

These are examples, not prescribed character designs. Do not invent a concrete
tool call, progress percentage, or generated result from a generic status event.
A crewhub-loops lane that reads `idle` does not automatically mean a task
succeeded.

## Feel and accessibility

Use purposeful easing, immediate selection feedback, and natural variation in
idle behavior. Avoid constant motion that competes with work. Keep text legible
and character silhouettes recognizable at overview scale.

Support keyboard selection and focus, touch without hover dependency, visible
focus indicators, text alternatives for status, and reduced motion. Audio is off
by default. If graphics are unavailable, provide a simple readable session view.

## Performance and evidence

The first slice deliberately caps presentation at 30 fps to control idle graphics
cost. This is a code limit, not a measured performance guarantee. Record browser, hardware, viewport,
device pixel ratio, and scene size when measuring. Start with three characters;
also check a busier scene before increasing scope.

Bound device pixel ratio, reuse assets, budget draw calls, stop unnecessary work
when hidden, and offer a lower rendering quality. Do not assume that moving from
a Tauri webview to a browser guarantees faster graphics.

Review the result at a desktop viewport and a touch-sized viewport. Capture stills
and a short interaction recording where tooling permits. Clearly report when an
actual tablet or target browser has not been tested. Build success alone is not
visual acceptance.

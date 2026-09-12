# Visual direction

## Intent

Create a place someone wants to keep open while their agents work. Aim for a
cohesive, crafted miniature world with expressive inhabitants and tactile
interaction. Choose a strong art direction and carry it through geometry,
materials, lighting, motion, interface, typography, and sound if later added.

Astra has creative freedom. The old world, its assets, and the current fixture
must not become accidental design constraints. The fixture's colors and layout
are disposable. Explore a few small sketches or scene variations, choose a
direction, and spend the implementation effort making one room excellent.

## First room

- One complete room with three distinguishable characters and meaningful places
  for them to work, wait, and present a result.
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
Herdr `idle` does not automatically mean a task succeeded.

## Feel and accessibility

Use purposeful easing, immediate selection feedback, and natural variation in
idle behavior. Avoid constant motion that competes with work. Keep text legible
and character silhouettes recognizable at overview scale.

Support keyboard selection and focus, touch without hover dependency, visible
focus indicators, text alternatives for status, and reduced motion. Audio is off
by default. If graphics are unavailable, provide a simple readable session view.

## Performance and evidence

Treat 60 fps on a documented desktop setup and 30 fps on a documented tablet as
initial targets, not existing guarantees. Record browser, hardware, viewport,
device pixel ratio, and scene size when measuring. Start with three characters;
also check a busier scene before increasing scope.

Bound device pixel ratio, reuse assets, budget draw calls, stop unnecessary work
when hidden, and offer a lower rendering quality. Do not assume that moving from
a Tauri webview to a browser guarantees faster graphics.

Review the result at a desktop viewport and a touch-sized viewport. Capture stills
and a short interaction recording where tooling permits. Clearly report when an
actual tablet or target browser has not been tested. Build success alone is not
visual acceptance.

# The Greenhouse: implementation and review

## Design rationale

The room is a small botanical studio: warm timber workstations, a glass rear wall,
cream cutaway architecture, terracotta plants, a lounge, books, and pendant lights.
Moss, Pip, and Orbit are rounded procedural robots with different colors and
accessories. Their poses, eye blinks, attention callouts, and selection halos give
the room character while the adjacent panel preserves a clear status overview.

An orthographic home camera provides a stable isometric basis. Free orbit, quarter
turns, zoom, and focus allow closer inspection. Walls fade when viewed from outside
their side of the room, and an explicit see-through mode fades both walls. Glass
uses a Fresnel shader, the floor uses an antialiased grid and subtle sunlight
pattern, and ground halos use a small animated shader. No external texture or
image generation is required at runtime.

## Verification performed

- Clean `npm ci` with Node 24.19.0 / npm 11.9.0, strict TypeScript checking, all
  13 headless engine tests, links in 19 Markdown files, and Vite production build.
- Local Vite HTTP smoke returned 200. Server-rendered text-first markup included
  all three companions and their status text. The actual initial layout passed
  every placement/access check, and a route completed after adding a prop.
- Procedural prop and bot factories instantiated in Node without a browser. A
  smoke scene with one added plant contained 181 meshes and 44,522 triangles,
  using 52 shared geometries and 46 shared materials. These counts exclude room
  architecture, shadows, and render passes; they are not GPU draw-call measurements.
- Rendering and navigation responsibilities are separate. Mock state changes and
  scene controls contain no model or live-session calls.
- The Three.js scene loads in a separate chunk; text-first mode does not need it.
- Procedural assets reuse geometry and materials, including instanced plant leaves.

**Interactive visual review is still pending.** The available cloud browser
rejected local preview navigation under its security policy. No alternate browser
or policy workaround was used. No screenshots, shader compilation results, GPU
frame-rate measurements, browser interaction pass, or touch-device pass are
claimed. Automated checks establish code and engine behavior, not visual quality.

## Performance policy, not measurements

Presentation is capped at 30 fps. Device pixel ratio is capped at 1.7, or 1 with
lighter graphics; lighter graphics also disable shadows. Hidden tabs stop their
animation loop. Paused and static reduced-motion views render briefly to settle
camera/wall transitions, then sleep until input or a view update. A 500 ms local
timer updates DOM cell text only when the cell changes. There are no sockets,
network polling loops, analytics, remote assets, or inference calls.

The initial production build puts roughly 72 kB gzip in the app chunk and 149 kB
gzip in the lazy scene chunk. The Three.js chunk exceeds Vite's default 500 kB
uncompressed advisory threshold; it is already deferred. These are bundle sizes,
not device performance measurements. Capture actual numbers before expanding
the room or increasing the default frame rate.

## Browser acceptance pass

Run `npm ci && npm run dev`, then review on desktop and an actual touch device.
Record browser, hardware, viewport, DPR, scene size, observed frame time, and any
console or shader errors. Use this sequence:

1. Inspect the initial isometric room for coherent lighting, readable silhouettes,
   overlapping labels, wall occlusion, and room framing at narrow and wide sizes.
2. Select every character in the room and panel. Focus and return home. Pan, zoom,
   rotate in both directions, use free orbit, and verify automatic and manual fading.
3. Exercise every scenario, simulated reply, sample result, pause, disconnect,
   and reconnect. Disconnection must preserve and label last known state.
4. Place, rotate, and move props. Reject overlaps, actor cells, the entrance, and
   blocked workstation access. Route agents around props and across each other.
5. Test 1 / 2 / 3, F, H, G, R, Escape, and canvas arrows/Enter. Check visible focus,
   screen-reader names, touch controls, and the mobile crew panel.
6. Verify reduced motion, lighter graphics, hidden-tab suspension, paused CPU/GPU
   behavior, text-first mode (`?view=list`), and graphics-failure fallback.
7. Export a layout, verify its coordinates, reset the room, and inspect console
   and memory behavior after repeated placement and view switching.

## Deliberate limits

One room, three simulated companions, no live runtime integration. Layout export
is implemented; import, undo, persistent storage, and a generated-model pipeline
are not. Agents have explicit local routes, not autonomous goals. Grid reservation
deadlocks require a new route. The geometry is art-directed for the initial grid;
changing room dimensions needs renderer work even though the engine accepts them.

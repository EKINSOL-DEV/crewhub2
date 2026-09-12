# 0002: Grid semantics before visual expansion

Status: accepted and implemented for the first room.

The user requested a grid foundation like a building game, so future models,
movable props, pathfinding, and agents share a lightweight understanding of space.

Use a renderer-free TypeScript package for cells, footprints, rotation, occupancy,
placement, routes, and semantic descriptions. Use Three.js separately for geometry,
shader materials, picking, and interpolation. React owns the oversight UI and
coarse view state; it does not reconcile meshes per frame.

The first room uses four-way A*, rectangular footprints, exclusive movement
reservations, and one flood fill per placement candidate. These rules are enough
for a single-floor room without a physics engine. A more sophisticated path planner
is a future measured extension, not a reason to couple navigation to mesh geometry.

An orthographic isometric home is the default. Orbit freedom is optional. Wall
fading and an explicit see-through control preserve oversight during exploration.
Camera state never changes grid coordinates or semantic world descriptions.

See [the grid contract](../GRID_ENGINE.md) and [review notes](../ROOM_REVIEW.md).

# Product vision

## Why restart

The owner, Nicky Goethals, is dissatisfied with CrewHub2's appearance and feel.
He wants a fresh visual environment with the quality and creativity he has seen
in Astra demonstrations. This is permission to rethink the entire presentation,
not a request to reproduce those demonstrations or claim a guaranteed result.

Keep the same repository and preserve the former version on an archive branch.
The bootstrap and first room were merged, and the user accepted the room's visual
direction. The 2D UI now uses the crewhub-loops [design system](DESIGN_SYSTEM.md).
On 2026-09-30 the direction changed: CrewHub World is a thin 3D layer on
crewhub-loops ([ADR 0005](decisions/0005-crewhub-world-on-loops.md)), and the
Greenhouse room was replaced by a town of project buildings.

## Product promise

Make working with an existing AI crew enjoyable, understandable, and personal.
Opening CrewHub should feel like entering a place where your crew works. Character
behavior and the environment should help explain actual activity and invite
interaction. Delight is a core product requirement.

## Accepted principles

- The main experience runs in a browser. An optional desktop shell may host the
  same experience later.
- Show the crew as crewhub-loops knows it.
- crewhub-loops is the service. A small CrewHub host (planned, not built) would read
  it and serve the world.
- Let ordinary code drive presentation. Watching agents incurs no model calls.
- Give the new visual work freedom over layout, style, characters, and motion.
- Keep an honest connection between real events and what the world communicates.
- Build one excellent room before expanding into a campus or feature catalog.
- Every project is a building. Agents sit in rooms by role, and work objects move
  through the rooms by status.

## First meaningful experience

A person opens the world, notices their small crew, understands who is working or
needs input, selects a character, and can inspect its activity. Completion has a
small, readable celebration. Attention is clear without becoming intrusive.

Tonight all activity comes from a scripted demo that uses the shapes crewhub-loops
serves, and it is visibly labelled as demo. A live crewhub-loops would drive the
same world through a host that is planned, not built.

## Success

The room has a coherent visual identity, appealing characters, enjoyable camera
and selection behavior, readable status, and responsive performance. It works
without an account or AI calls: a labelled demo works without an account. Only the
source changes when a live host exists; the world does not need redesign.

The exact art style is open. A particular robot shape, biome, color palette, or
old panel layout is not a requirement. Collaboration is the long-term purpose;
autonomous meeting loops, scheduling, billing, and multi-user hosting are outside
the initial build.

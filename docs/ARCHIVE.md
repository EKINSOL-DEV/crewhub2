# Desktop archive and migration

## Preserved baseline

| Item | Reference |
| --- | --- |
| Repository | `EKINSOL-DEV/crewhub2` |
| Original main commit | `2c194164f0cd933feaf878a5b46ee0eb88d00546` |
| Archive branch | `archive/crewhub2-desktop` |
| Rebuild branch | `rebuild/browser-world` |
| Snapshot date | 2026-09-12 |

The archive branch was created from the original main commit and read back before
removing legacy files from the new worktree. Its
[pinned commit](https://github.com/EKINSOL-DEV/crewhub2/commit/2c194164f0cd933feaf878a5b46ee0eb88d00546)
remains the precise baseline even if someone later moves the branch.

This snapshot covers committed `main` content. Other existing remote branches
remain untouched. It cannot capture uncommitted changes on another machine.

The rebuild is a normal descendant commit that replaces the tracked application
files while preserving LICENSE. It is not an orphan history, force-push, or
repository deletion. Old source, assets, plans, workflows, and build configuration
are available in the archive and history.

## Inspect the old version without switching the rebuild

```bash
git fetch origin
git worktree add --detach ../crewhub2-desktop-reference \
  2c194164f0cd933feaf878a5b46ee0eb88d00546
```

Use the archived README and toolchain when running that version. Do not copy its
dependency lockfile, agent instructions, or plans into the new workspace.

## Reuse selectively

Port a specific utility or adapter only when the new architecture needs it. Review
its assumptions, dependencies, behavior, and asset licensing. Preserve required
notices. Record any decision that changes the new product direction.

The rebuild should be reviewed through a pull request. Merging into main is a
separate action from preparing this bootstrap. If a merged change needs rollback,
use a reviewed revert or a recovery branch from the pinned commit; do not rewrite
shared history.

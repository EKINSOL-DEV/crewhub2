/**
 * FUTURE (proposal L22 "project groups"): where a project's group comes from. crewhub-loops has no level above
 * projects today, so a real source lists no groups and every project resolves to null. The demo fills `groupId` and
 * the list; the day loops offers groups, only these two functions and the source's read change.
 */
import type { ProjectGroup, ProjectOut } from "./types.ts";

/** The group a project belongs to, or null: no `groupId`, or one that names no listed group. */
export function groupOf(project: Pick<ProjectOut, "groupId">, groups: readonly ProjectGroup[]): ProjectGroup | null {
  const id = project.groupId;
  if (id === undefined || id === null) return null;
  return groups.find((group) => group.id === id) ?? null;
}

/** Groups in their order; equal orders fall back to the slug, so the result never depends on the input order. */
export function sortProjectGroups(groups: readonly ProjectGroup[]): ProjectGroup[] {
  return [...groups].sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug) || a.id.localeCompare(b.id));
}

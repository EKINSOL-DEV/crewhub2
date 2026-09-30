/* A person's role choice per agent (plan 4.2), kept in this browser. Storage may throw (private mode, blocked site
   data): the choice then lasts for this page only. */
import type { RoleId } from "@crewhub/world-model";

export const ROLE_OVERRIDES_KEY = "crewhub-world.role-overrides";
const ROLES: readonly RoleId[] = ["lead", "worker", "analyst", "design"];

/** Only well-formed entries survive: an agent key and a known role. */
export function parseRoleOverrides(raw: string | null): Record<string, RoleId> {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: Record<string, RoleId> = {};
    for (const [key, role] of Object.entries(value)) if (key && ROLES.includes(role as RoleId)) out[key] = role as RoleId;
    return out;
  } catch {
    return {};
  }
}

export function readRoleOverrides(storage: Pick<Storage, "getItem"> | null = safeStorage()): Record<string, RoleId> {
  try {
    return parseRoleOverrides(storage?.getItem(ROLE_OVERRIDES_KEY) ?? null);
  } catch {
    return {};
  }
}

export function writeRoleOverrides(overrides: Record<string, RoleId>, storage: Pick<Storage, "setItem"> | null = safeStorage()) {
  try {
    storage?.setItem(ROLE_OVERRIDES_KEY, JSON.stringify(overrides));
  } catch {
    /* The choice lasts for this page only. */
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

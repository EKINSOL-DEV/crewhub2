/* A person's role choice per agent (plan 4.2), kept in this browser (state/setting.ts). */
import type { RoleId } from "@crewhub/world-model";
import { storedValue } from "./setting.ts";

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

const stored = storedValue<Record<string, RoleId>>({ key: ROLE_OVERRIDES_KEY, parse: parseRoleOverrides, format: (overrides) => JSON.stringify(overrides) });
export const readRoleOverrides = stored.read;
export const writeRoleOverrides = stored.write;

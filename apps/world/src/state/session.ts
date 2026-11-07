/* Adapter for the copied chat: loops' `useSession` (crewhub-loops apps/web/src/state/session.tsx @ a1bed0f), in demo mode.
   The world has no sign-in: the demo person is Nicky, an admin, the person the demo source's chat acts as. Live mode
   reads the person's loops session instead (plan section 3.5). */
import { DEMO_PERSON } from "@crewhub/demo";
import type { PrincipalKind } from "../api/types";

export interface SessionPrincipal {
  id: string;
  kind: PrincipalKind;
  displayName: string;
  role: "admin" | "member";
}

export interface Session {
  status: "authed";
  principal: SessionPrincipal | null;
  isAdmin: boolean;
  isOwner: boolean;
  error: null;
}

const DEMO_SESSION: Session = {
  status: "authed",
  principal: { id: DEMO_PERSON, kind: "user", displayName: "Nicky", role: "admin" },
  isAdmin: true,
  isOwner: true,
  error: null,
};

export function useSession(): Session {
  return DEMO_SESSION;
}

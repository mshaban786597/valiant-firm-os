"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { can, type Action } from "@/lib/permissions";

const RoleContext = createContext<string | null | undefined>(undefined);

/**
 * Provides the current user's role to client components so they can hide
 * actions the server would reject anyway. This is UX only — the API routes
 * are the real enforcement (see requirePermission).
 */
export function PermissionsProvider({
  role,
  children,
}: {
  role: string | null | undefined;
  children: ReactNode;
}) {
  const value = useMemo(() => role, [role]);
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

/** Hook returning a `can(action)` checker bound to the current role. */
export function useCan() {
  const role = useContext(RoleContext);
  return (action: Action) => can(role, action);
}

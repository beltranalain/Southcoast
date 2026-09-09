"use client";

import { createContext, useContext } from "react";
import type { Role } from "./admin";

// Shares the signed-in admin's verified role from the layout gate down to the
// nav and pages so they can gate by role. The client gate is convenience only;
// the server API routes always re-verify the token + role.
export type AdminRoleValue = { role: Role | null; email: string | null; isOwner: boolean };

const AdminRoleContext = createContext<AdminRoleValue>({ role: null, email: null, isOwner: false });

export const AdminRoleProvider = AdminRoleContext.Provider;

export function useAdminRole(): AdminRoleValue {
  return useContext(AdminRoleContext);
}

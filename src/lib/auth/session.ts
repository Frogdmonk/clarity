import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppRole, Verification } from "@/lib/types";

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  ugNumber: string | null;
  role: AppRole;
  verification: Verification;
}

export function homeFor(role: AppRole): string {
  return role === "admin" ? "/admin" : role === "teacher" ? "/teacher" : "/student";
}

/** Validated with the Auth server (getUser), never getSession() alone. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;

  const [profile, role] = await Promise.all([
    supabase.from("profiles").select("full_name, ug_number, verification").eq("id", user.id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle(),
  ]);
  if (!profile.data) return null;
  return {
    id: user.id,
    email: user.email ?? "",
    fullName: profile.data.full_name as string,
    ugNumber: (profile.data.ug_number as string | null) ?? null,
    role: ((role.data?.role as AppRole | undefined) ?? "student"),
    verification: profile.data.verification as Verification,
  };
});

/**
 * Layout-level gate. This is a convenience: RLS/RPCs in Postgres are the real enforcement,
 * and a user who bypasses this still cannot read or write anything they should not.
 */
export async function requireRole(role: AppRole): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.verification !== "verified") redirect("/pending");
  if (user.role !== role) redirect(homeFor(user.role));
  return user;
}

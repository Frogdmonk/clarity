import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { requireRole } from "@/lib/auth/session";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireRole("admin");
  return (
    <AppShell
      user={user}
      links={[
        { href: "/admin", label: "Overview" },
        { href: "/admin/users", label: "Users" },
        { href: "/admin/roster", label: "Roster" },
        { href: "/admin/settings", label: "Settings" },
        { href: "/admin/audit", label: "Audit" },
      ]}
    >
      {children}
    </AppShell>
  );
}

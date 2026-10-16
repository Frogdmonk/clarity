import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { requireRole } from "@/lib/auth/session";

export default async function TeacherLayout({ children }: { children: ReactNode }) {
  const user = await requireRole("teacher");
  return (
    <AppShell
      wide
      user={user}
      links={[
        { href: "/teacher", label: "Courses" },
        { href: "/teacher/doubt-bank", label: "Doubt Bank" },
        { href: "/teacher/activities", label: "Activities" },
      ]}
    >
      {children}
    </AppShell>
  );
}

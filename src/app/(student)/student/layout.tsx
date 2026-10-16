import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { requireRole } from "@/lib/auth/session";

export default async function StudentLayout({ children }: { children: ReactNode }) {
  const user = await requireRole("student");
  return (
    <AppShell
      user={user}
      links={[
        { href: "/student", label: "Home" },
        { href: "/student/join", label: "Join" },
        { href: "/student/help", label: "Questions" },
        { href: "/student/notebook", label: "Notebook" },
        { href: "/student/courses", label: "Courses" },
        { href: "/student/profile", label: "Profile" },
      ]}
    >
      {children}
    </AppShell>
  );
}

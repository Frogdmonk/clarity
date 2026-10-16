import Link from "next/link";
import type { ReactNode } from "react";
import { copy } from "@/content/copy";
import { SignOutButton } from "./sign-out";
import type { CurrentUser } from "@/lib/auth/session";

export interface NavLink { href: string; label: string }

export function AppShell({ user, links, children, wide }: {
  user: CurrentUser; links: NavLink[]; children: ReactNode; wide?: boolean;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2">
          <Link href="/" className="text-lg font-semibold text-accent">{copy.brand}</Link>
          <nav aria-label="Main" className="hidden flex-1 gap-1 md:flex">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-md px-3 py-2 text-sm hover:bg-surface-2">{l.label}</Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="hidden text-text-2 sm:inline">{user.fullName}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main id="main" className={`mx-auto w-full flex-1 px-4 py-5 pb-24 md:pb-8 ${wide ? "max-w-[1600px]" : "max-w-5xl"}`}>
        {children}
      </main>
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 grid border-t border-border bg-surface md:hidden"
        style={{ gridTemplateColumns: `repeat(${Math.min(links.length, 5)}, minmax(0, 1fr))` }}>
        {links.slice(0, 5).map((l) => (
          <Link key={l.href} href={l.href} className="flex min-h-[56px] items-center justify-center px-1 text-center text-xs font-medium hover:bg-surface-2">
            {l.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

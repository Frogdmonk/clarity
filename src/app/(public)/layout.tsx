import type { ReactNode } from "react";
import Link from "next/link";
import { copy } from "@/content/copy";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <header className="mb-6 text-center">
        <Link href="/" className="text-2xl font-semibold text-accent">{copy.brand}</Link>
        <p className="mt-1 text-sm text-text-2">{copy.tagline}</p>
      </header>
      <main id="main" className="rounded-lg border border-border bg-surface p-5">{children}</main>
      <footer className="mt-6 text-center text-xs text-text-3">
        <Link href="/privacy" className="underline">Privacy</Link>
      </footer>
    </div>
  );
}

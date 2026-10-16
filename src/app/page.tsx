import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, homeFor } from "@/lib/auth/session";
import { copy } from "@/content/copy";

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect(user.verification === "verified" ? homeFor(user.role) : "/pending");
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-4 py-12">
      <h1 className="text-4xl font-semibold text-accent">{copy.brand}</h1>
      <p className="text-xl">{copy.tagline}</p>
      <p className="text-text-2">
        Tap once to say you&apos;re lost, ask privately, and see that your teacher noticed. {copy.normalise}
      </p>
      <div className="flex gap-3">
        <Link href="/login" className="inline-flex min-h-[44px] items-center rounded-md bg-accent px-5 font-medium text-accent-contrast">Sign in</Link>
        <Link href="/register" className="inline-flex min-h-[44px] items-center rounded-md border border-border px-5 font-medium">Create account</Link>
      </div>
    </main>
  );
}

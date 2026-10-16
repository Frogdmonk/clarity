"use client";
import { Button } from "@/components/ui/button";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-md space-y-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-text-2">Your work is saved on this device where possible. Try again.</p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}

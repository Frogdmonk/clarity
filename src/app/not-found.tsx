import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md space-y-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <Link href="/" className="underline">Go home</Link>
    </main>
  );
}

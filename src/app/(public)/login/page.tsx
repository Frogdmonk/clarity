import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/card";
import { loginAction } from "@/lib/auth/actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Sign in</h1>
      {error === "link" && <Alert tone="warn">That link has expired or was already used. Try signing in, or request a new one.</Alert>}
      <AuthForm action={loginAction} submit="Sign in">
        {() => (
          <>
            <Field label="Email" htmlFor="email">
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </Field>
          </>
        )}
      </AuthForm>
      <p className="flex justify-between text-sm">
        <Link href="/forgot-password" className="underline">Forgot password?</Link>
        <Link href="/register" className="underline">Create an account</Link>
      </p>
    </div>
  );
}

import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { Field, Input } from "@/components/ui/field";
import { registerAction } from "@/lib/auth/actions";

export default function RegisterPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Create your account</h1>
      <AuthForm action={registerAction} submit="Create account">
        {(e) => (
          <>
            <Field label="Full name" htmlFor="full_name" error={e.full_name}>
              <Input id="full_name" name="full_name" autoComplete="name" required />
            </Field>
            <Field label="UG number" htmlFor="ug_number" hint="Format: UG/24/00123" error={e.ug_number}>
              <Input id="ug_number" name="ug_number" autoComplete="off" placeholder="UG/24/00123" required />
            </Field>
            <Field label="Email" htmlFor="email" error={e.email}>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </Field>
            <Field label="Password" htmlFor="password" hint="At least 10 characters." error={e.password}>
              <Input id="password" name="password" type="password" autoComplete="new-password" required />
            </Field>
            <div className="space-y-1">
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="consent" className="mt-1 size-5" required />
                <span>
                  I&apos;ve read the <Link href="/privacy" className="underline">privacy notice</Link>.
                </span>
              </label>
              {e.consent && <p role="alert" className="text-xs text-danger">{e.consent}</p>}
            </div>
          </>
        )}
      </AuthForm>
      <p className="text-sm">Already registered? <Link href="/login" className="underline">Sign in</Link></p>
    </div>
  );
}

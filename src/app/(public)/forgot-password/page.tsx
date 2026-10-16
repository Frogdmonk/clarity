import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { Field, Input } from "@/components/ui/field";
import { forgotPasswordAction } from "@/lib/auth/actions";

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Reset your password</h1>
      <AuthForm action={forgotPasswordAction} submit="Send reset link">
        {() => (
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
        )}
      </AuthForm>
      <p className="text-sm"><Link href="/login" className="underline">Back to sign in</Link></p>
    </div>
  );
}

import { AuthForm } from "@/components/auth/auth-form";
import { Field, Input } from "@/components/ui/field";
import { resetPasswordAction } from "@/lib/auth/actions";

export default function ResetPasswordPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Choose a new password</h1>
      <AuthForm action={resetPasswordAction} submit="Save password">
        {(e) => (
          <Field label="New password" htmlFor="password" hint="At least 10 characters." error={e.password}>
            <Input id="password" name="password" type="password" autoComplete="new-password" required />
          </Field>
        )}
      </AuthForm>
    </div>
  );
}

"use client";
import { useActionState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import type { FormState } from "@/lib/auth/actions";

export function AuthForm({ action, submit, children }: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  submit: string;
  children: (errors: Record<string, string>) => ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.message && <Alert tone="ok">{state.message}</Alert>}
      {children(state.fieldErrors ?? {})}
      <Button type="submit" block disabled={pending}>
        {pending ? "Please wait…" : submit}
      </Button>
    </form>
  );
}

"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { loginSchema, registerSchema, emailSchema, resetSchema } from "@/lib/validation/schemas";
import { copy } from "@/content/copy";

export interface FormState {
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
}

async function siteUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return process.env.NEXT_PUBLIC_SITE_URL ?? (host ? `${proto}://${host}` : "http://localhost:3000");
}

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const k = String(i.path[0] ?? "form");
    if (!(k in out)) out[k] = i.message;
  }
  return out;
}

export async function loginAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: copy.errors.auth };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: copy.errors.auth }; // generic: no account enumeration
  redirect("/");
}

export async function registerAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues) };
  const { full_name, ug_number, email, password } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name, ug_number },
      emailRedirectTo: `${await siteUrl()}/auth/confirm?next=/`,
    },
  });
  // One generic error for every failure (bad/duplicate UG, weak password, etc.); duplicate emails
  // already look like success from Supabase. Nothing here confirms whether an account exists.
  if (error) return { error: copy.errors.auth };
  return { message: "Check your email to confirm your address, then sign in." };
}

export async function forgotPasswordAction(_: FormState, formData: FormData): Promise<FormState> {
  const email = emailSchema.safeParse(formData.get("email"));
  if (email.success) {
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(email.data, {
      redirectTo: `${await siteUrl()}/auth/confirm?next=/reset-password`,
    });
  }
  return { message: "If that address has an account, a reset link is on its way." };
}

export async function resetPasswordAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues) };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "That link may have expired. Request a new one." };
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

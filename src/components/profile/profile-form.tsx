"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Alert, Card, PageHeader } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { usePref } from "@/lib/use-pref";
import { errorMessage } from "@/content/copy";

export function ProfileForm({ userId, initialName, ugNumber }: { userId: string; initialName: string; ugNumber: string | null }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [theme, setTheme] = usePref("pref:theme", "system");
  const [hideProgress, setHideProgress] = usePref("clarity:hideProgress", "0");

  const save = useMutation({
    mutationFn: async () => {
      // Only full_name is writable by the client (column grant); RLS restricts to own row.
      const { error } = await createClient().from("profiles").update({ full_name: name.trim() }).eq("id", userId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { setMsg({ ok: true, text: "Name updated." }); router.refresh(); },
    onError: () => setMsg({ ok: false, text: errorMessage("generic") }),
  });

  return (
    <div className="mx-auto max-w-md space-y-4">
      <PageHeader title="Profile" />
      <Card>
        <form onSubmit={(e) => { e.preventDefault(); setMsg(null); save.mutate(); }} className="space-y-3">
          <Field label="Full name" htmlFor="pname"><Input id="pname" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} /></Field>
          {ugNumber && <p className="text-sm text-text-2">UG number: <span className="font-mono">{ugNumber}</span></p>}
          {msg && <Alert tone={msg.ok ? "ok" : "danger"}>{msg.text}</Alert>}
          <Button type="submit" disabled={name.trim().length < 2 || save.isPending}>{save.isPending ? "Saving…" : "Save name"}</Button>
        </form>
      </Card>
      <Card className="space-y-3">
        <Field label="Theme" htmlFor="theme">
          <Select id="theme" value={theme} onChange={(e) => setTheme(e.target.value)}>
            <option value="system">Match my device</option><option value="light">Light</option><option value="dark">Dark</option>
          </Select>
        </Field>
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input type="checkbox" checked={hideProgress !== "1"} onChange={(e) => setHideProgress(e.target.checked ? "0" : "1")} />
          Show my private weekly view on Home
        </label>
      </Card>
    </div>
  );
}

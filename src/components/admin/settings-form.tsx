"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert, Card, PageHeader } from "@/components/ui/card";
import { adminListSettings, adminUpdateSettings, codeOf, type AdminSettings } from "@/lib/rpc/rpc";
import { errorMessage } from "@/content/copy";

export function SettingsForm() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["adminSettings"], queryFn: adminListSettings });
  const [draft, setDraft] = useState<AdminSettings | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const s = draft ?? q.data;

  const save = useMutation({
    mutationFn: () => {
      if (!s) throw new Error("none");
      try { new RegExp(s.ug_regex); } catch { throw new Error("regex"); }
      return adminUpdateSettings(s);
    },
    onSuccess: async () => { setMsg({ tone: "ok", text: "Settings saved." }); setDraft(null); await qc.invalidateQueries({ queryKey: ["adminSettings"] }); },
    onError: (e) => setMsg({ tone: "danger", text: e instanceof Error && e.message === "regex" ? "That UG pattern isn't a valid regular expression." : errorMessage(codeOf(e)) }),
  });

  if (!s) return <p role="status">Loading…</p>;
  return (
    <div className="mx-auto max-w-md space-y-4">
      <PageHeader title="Platform settings" />
      <Card>
        <form onSubmit={(e) => { e.preventDefault(); setMsg(null); save.mutate(); }} className="space-y-3">
          <label className="flex min-h-[44px] items-center gap-2 text-sm">
            <input type="checkbox" checked={s.roster_mode} onChange={(e) => setDraft({ ...s, roster_mode: e.target.checked })} />
            Roster mode: only students on the imported roster are auto-verified
          </label>
          <Field label="UG number pattern (regular expression)" htmlFor="rx"><Input id="rx" className="font-mono" value={s.ug_regex} onChange={(e) => setDraft({ ...s, ug_regex: e.target.value })} /></Field>
          <Field label="Default Doubt Bank window (hours)" htmlFor="dbh">
            <Input id="dbh" type="number" min={0} max={168} value={s.doubt_bank_hours} onChange={(e) => setDraft({ ...s, doubt_bank_hours: Math.max(0, Math.min(168, Number(e.target.value) || 0)) })} />
          </Field>
          {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
          <Button type="submit" disabled={!draft || save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
        </form>
      </Card>
    </div>
  );
}

"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert, Card, Empty, PageHeader } from "@/components/ui/card";
import { fetchTeacherSessions, keys } from "@/lib/queries";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/content/copy";
import { listSubmissions } from "@/lib/rpc/rpc";
import { dateTime } from "@/lib/format";
import { titleSchema } from "@/lib/validation/schemas";
import type { Activity } from "@/lib/types";

const LANGS = ["plaintext", "python", "javascript", "java", "cpp"];

function Submissions({ activityId }: { activityId: string }) {
  const q = useQuery({ queryKey: ["subs", activityId], queryFn: () => listSubmissions(activityId) });
  if (!q.data?.length) return <p className="text-xs text-text-3">No submissions yet.</p>;
  return (
    <ul className="divide-y divide-border text-sm">
      {q.data.map((s) => <li key={s.student_id} className="flex justify-between py-1"><span>{s.full_name}</span><span className="text-xs text-text-3">v{s.latest_version} · {s.attempts} attempt{s.attempts === 1 ? "" : "s"} · {dateTime(s.submitted_at)}</span></li>)}
    </ul>
  );
}

export function ActivitiesManager({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const sessions = useQuery({ queryKey: keys.teacherSessions(), queryFn: fetchTeacherSessions });
  const acts = useQuery({
    queryKey: ["allActivities"],
    queryFn: async () => {
      const { data, error } = await createClient().from("activities").select("*").order("created_at", { ascending: false }).limit(100);
      if (error) throw new Error(error.message);
      return (data ?? []) as Activity[];
    },
  });
  const [sid, setSid] = useState("");
  const [title, setTitle] = useState("");
  const [statement, setStatement] = useState("");
  const [lang, setLang] = useState("python");
  const [starter, setStarter] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const t = titleSchema.parse(title);
      const { error } = await createClient().from("activities").insert({
        session_id: sid, title: t, statement, language: lang, starter_code: starter, created_by: userId,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => { setTitle(""); setStatement(""); setStarter(""); setMsg({ tone: "ok", text: "Activity created." }); await qc.invalidateQueries({ queryKey: ["allActivities"] }); },
    onError: () => setMsg({ tone: "danger", text: "Couldn't create the activity. Check the title (2+ characters) and session." }),
  });
  const toggle = useMutation({
    mutationFn: async (a: Activity) => {
      const { error } = await createClient().from("activities").update({ closed: !a.closed }).eq("id", a.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["allActivities"] }),
    onError: () => setMsg({ tone: "danger", text: errorMessage("generic") }),
  });
  const title_of = (id: string) => sessions.data?.find((s) => s.id === id);

  return (
    <div className="space-y-5">
      <PageHeader title="Coding activities" />
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Card className="space-y-3">
        <h2 className="font-medium">New activity</h2>
        <form onSubmit={(e) => { e.preventDefault(); setMsg(null); create.mutate(); }} className="space-y-3">
          <Field label="Session" htmlFor="a-s">
            <Select id="a-s" value={sid} onChange={(e) => setSid(e.target.value)}>
              <option value="">Choose a session…</option>
              {sessions.data?.filter((s) => s.status !== "ended").map((s) => <option key={s.id} value={s.id}>{s.courses.title} · {s.title}</option>)}
            </Select>
          </Field>
          <Field label="Title" htmlFor="a-t"><Input id="a-t" value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Task (plain text)" htmlFor="a-st"><Textarea id="a-st" rows={4} maxLength={20000} value={statement} onChange={(e) => setStatement(e.target.value)} /></Field>
          <Field label="Language" htmlFor="a-l"><Select id="a-l" value={lang} onChange={(e) => setLang(e.target.value)}>{LANGS.map((l) => <option key={l}>{l}</option>)}</Select></Field>
          <Field label="Starter code (optional)" htmlFor="a-sc"><Textarea id="a-sc" rows={5} className="font-mono" value={starter} onChange={(e) => setStarter(e.target.value)} /></Field>
          <Button type="submit" disabled={!sid || !title.trim() || create.isPending}>{create.isPending ? "Creating…" : "Create activity"}</Button>
        </form>
        <p className="text-xs text-text-3">Code is never executed by this app; students write and share it as text.</p>
      </Card>
      {!acts.data?.length ? <Empty>No activities yet.</Empty> : acts.data.map((a) => (
        <Card key={a.id} className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div><h3 className="font-medium">{a.title}</h3><p className="text-xs text-text-3">{title_of(a.session_id)?.courses.title} · {title_of(a.session_id)?.title} · {a.language}</p></div>
            <Button variant="secondary" disabled={toggle.isPending} onClick={() => toggle.mutate(a)}>{a.closed ? "Reopen" : "Close"}</Button>
          </div>
          <Submissions activityId={a.id} />
        </Card>
      ))}
    </div>
  );
}

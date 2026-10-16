"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert, Card, Empty, PageHeader } from "@/components/ui/card";
import { codeOf, createSession, enrolStudents, removeStudent, teacherCourseRoster } from "@/lib/rpc/rpc";
import { fetchCourse, fetchCourseSessions, keys } from "@/lib/queries";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/content/copy";
import { dateTime } from "@/lib/format";
import { normaliseUg } from "@/lib/validation/ug";
import type { AnonMode, CourseSettings } from "@/lib/types";

export function CoursePage({ courseId }: { courseId: string }) {
  const qc = useQueryClient();
  const router = useRouter();
  const course = useQuery({ queryKey: keys.course(courseId), queryFn: () => fetchCourse(courseId) });
  const sessions = useQuery({ queryKey: keys.courseSessions(courseId), queryFn: () => fetchCourseSessions(courseId) });
  const roster = useQuery({ queryKey: keys.roster(courseId), queryFn: () => teacherCourseRoster(courseId) });

  const [sTitle, setSTitle] = useState("");
  const [ugText, setUgText] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "danger" | "warn"; text: string } | null>(null);
  const [settings, setSettings] = useState<CourseSettings | null>(null);
  const eff = settings ?? course.data?.settings ?? null;

  const newSession = useMutation({
    mutationFn: () => createSession(courseId, sTitle.trim()),
    onSuccess: (r) => router.push(`/teacher/sessions/${r.id}`),
    onError: (e) => setMsg({ tone: "danger", text: errorMessage(codeOf(e)) }),
  });
  const enrol = useMutation({
    mutationFn: () => {
      const nums = [...new Set(ugText.split(/[\s,;]+/).filter(Boolean).map((x) => normaliseUg(x)))];
      if (!nums.length) throw new Error("none");
      return enrolStudents(courseId, nums);
    },
    onSuccess: async (r) => {
      setUgText("");
      setMsg(r.not_found.length
        ? { tone: "warn", text: `Enrolled ${r.enrolled}. Not found: ${r.not_found.join(", ")} (they must register first).` }
        : { tone: "ok", text: `Enrolled ${r.enrolled}.` });
      await qc.invalidateQueries({ queryKey: keys.roster(courseId) });
    },
    onError: (e) => setMsg({ tone: "danger", text: e instanceof Error && e.message === "none" ? "Enter at least one valid UG number." : errorMessage(codeOf(e)) }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => removeStudent(courseId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.roster(courseId) }),
    onError: (e) => setMsg({ tone: "danger", text: errorMessage(codeOf(e)) }),
  });
  const saveSettings = useMutation({
    mutationFn: async () => {
      if (!eff) return;
      const { error } = await createClient().from("courses").update({ settings: eff }).eq("id", courseId);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => { setMsg({ tone: "ok", text: "Settings saved." }); await qc.invalidateQueries({ queryKey: keys.course(courseId) }); },
    onError: () => setMsg({ tone: "danger", text: errorMessage("generic") }),
  });

  if (course.isLoading) return <p role="status">Loading…</p>;
  if (!course.data || !eff) return <Alert tone="danger">{errorMessage("not_found")}</Alert>;
  const sess = sessions.data ?? [];

  return (
    <div className="space-y-6">
      <Link href="/teacher" className="text-sm underline">← Courses</Link>
      <PageHeader title={course.data.title} />
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

      <section className="space-y-2" aria-labelledby="s-h">
        <h2 id="s-h" className="font-medium">Sessions</h2>
        <form onSubmit={(e) => { e.preventDefault(); setMsg(null); newSession.mutate(); }} className="flex flex-wrap items-end gap-2">
          <Field label="New session title" htmlFor="s-title"><Input id="s-title" value={sTitle} maxLength={160} onChange={(e) => setSTitle(e.target.value)} /></Field>
          <Button type="submit" disabled={sTitle.trim().length < 2 || newSession.isPending}>{newSession.isPending ? "Creating…" : "Create session"}</Button>
        </form>
        {!sess.length ? <Empty>No sessions yet.</Empty> : (
          <Card className="divide-y divide-border p-0">
            {sess.map((s) => (
              <Link key={s.id} href={s.status === "ended" ? `/teacher/sessions/${s.id}/summary` : `/teacher/sessions/${s.id}`} className="flex min-h-[44px] items-center justify-between px-4 py-2 hover:bg-surface-2">
                <span>{s.title}</span><span className="text-xs text-text-3 capitalize">{s.status} · {dateTime(s.started_at ?? s.created_at)}</span>
              </Link>
            ))}
          </Card>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="font-medium">Roster ({roster.data?.filter((r) => r.status === "active").length ?? 0})</h2>
          <form onSubmit={(e) => { e.preventDefault(); setMsg(null); enrol.mutate(); }} className="space-y-2">
            <Field label="Add students by UG number" htmlFor="ug" hint="Separate with spaces, commas or new lines."><Textarea id="ug" rows={3} value={ugText} onChange={(e) => setUgText(e.target.value)} /></Field>
            <Button type="submit" disabled={!ugText.trim() || enrol.isPending}>{enrol.isPending ? "Adding…" : "Add"}</Button>
          </form>
          <ul className="max-h-80 divide-y divide-border overflow-y-auto">
            {roster.data?.filter((r) => r.status !== "removed").map((r) => (
              <li key={r.user_id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span>{r.full_name} <span className="font-mono text-xs text-text-3">{r.ug_number}</span></span>
                <Button variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate(r.user_id)}>Remove</Button>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="space-y-3">
          <h2 className="font-medium">Course settings</h2>
          <Field label="Question anonymity" htmlFor="anon" hint="Masked: you see “Student #A7”; revealing notifies the student. Strict: identity is never available to you.">
            <Select id="anon" value={eff.anonymity_mode} onChange={(e) => setSettings({ ...eff, anonymity_mode: e.target.value as AnonMode })}>
              <option value="identified">Identified</option><option value="masked">Masked (reveal is audited)</option><option value="strict">Strict</option>
            </Select>
          </Field>
          <Field label="Doubt Bank window (hours after class)" htmlFor="db">
            <Input id="db" type="number" min={0} max={168} value={eff.doubt_bank_hours} onChange={(e) => setSettings({ ...eff, doubt_bank_hours: Math.max(0, Math.min(168, Number(e.target.value) || 0)) })} />
          </Field>
          {(["pulse_reveal_after_commit", "impact_messages", "exit_ticket"] as const).map((k) => (
            <label key={k} className="flex min-h-[44px] items-center gap-2 text-sm">
              <input type="checkbox" checked={eff.behaviour[k]} onChange={(e) => setSettings({ ...eff, behaviour: { ...eff.behaviour, [k]: e.target.checked } })} />
              {k === "pulse_reveal_after_commit" ? "Students see the class pulse only after they answer" : k === "impact_messages" ? "Tell students when their question helped others" : "Exit ticket at the end of class"}
            </label>
          ))}
          <Button disabled={!settings || saveSettings.isPending} onClick={() => { setMsg(null); saveSettings.mutate(); }}>{saveSettings.isPending ? "Saving…" : "Save settings"}</Button>
        </Card>
      </section>
    </div>
  );
}

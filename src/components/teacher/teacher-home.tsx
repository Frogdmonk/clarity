"use client";
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Alert, Card, Empty, PageHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { codeOf, createCourse } from "@/lib/rpc/rpc";
import { fetchMyCourses, fetchTeacherSessions, keys } from "@/lib/queries";
import { errorMessage } from "@/content/copy";
import { titleSchema } from "@/lib/validation/schemas";
import { dateTime } from "@/lib/format";

export function TeacherHome() {
  const qc = useQueryClient();
  const courses = useQuery({ queryKey: keys.myCourses(), queryFn: fetchMyCourses });
  const sessions = useQuery({ queryKey: keys.teacherSessions(), queryFn: fetchTeacherSessions, refetchInterval: 15_000 });
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => createCourse(titleSchema.parse(title), desc.trim() || undefined),
    onSuccess: async () => { setOpen(false); setTitle(""); setDesc(""); await qc.invalidateQueries({ queryKey: keys.myCourses() }); },
    onError: (e) => setErr(e instanceof Error && e.name === "ZodError" ? "Give the course a title of at least 2 characters." : errorMessage(codeOf(e))),
  });
  const live = sessions.data?.filter((s) => s.status === "live") ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Your courses"><Button onClick={() => { setErr(null); setOpen(true); }}>New course</Button></PageHeader>
      {live.length > 0 && (
        <section aria-labelledby="live-h" className="space-y-2">
          <h2 id="live-h" className="font-medium">Live now</h2>
          {live.map((s) => (
            <Link key={s.id} href={`/teacher/sessions/${s.id}`} className="flex min-h-[56px] items-center justify-between rounded-lg border-2 border-accent bg-surface px-4 py-3">
              <span><span className="font-medium">{s.courses.title}</span> · {s.title}</span><span className="text-sm font-medium text-accent">Open console →</span>
            </Link>
          ))}
        </section>
      )}
      {courses.isLoading ? <p role="status">Loading…</p> : !courses.data?.length ? <Empty>No courses yet. Create one to get started.</Empty> : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {courses.data.filter((c) => c.member_role === "teacher").map((c) => (
            <li key={c.course_id}><Link href={`/teacher/courses/${c.course_id}`} className="block h-full rounded-lg border border-border bg-surface p-4 hover:bg-surface-2">
              <h2 className="font-medium">{c.courses.title}</h2>
              {c.courses.description && <p className="mt-1 line-clamp-2 text-sm text-text-2">{c.courses.description}</p>}
            </Link></li>
          ))}
        </ul>
      )}
      {(sessions.data?.filter((s) => s.status === "ended").length ?? 0) > 0 && (
        <section aria-labelledby="past-h" className="space-y-2">
          <h2 id="past-h" className="font-medium">Recent sessions</h2>
          <Card className="divide-y divide-border p-0">
            {sessions.data?.filter((s) => s.status === "ended").slice(0, 8).map((s) => (
              <Link key={s.id} href={`/teacher/sessions/${s.id}/summary`} className="flex min-h-[44px] items-center justify-between px-4 py-2 hover:bg-surface-2">
                <span>{s.courses.title} · {s.title}</span><span className="text-xs text-text-3">{dateTime(s.ended_at)}</span>
              </Link>
            ))}
          </Card>
        </section>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title="New course">
        <form onSubmit={(e) => { e.preventDefault(); setErr(null); create.mutate(); }} className="space-y-3">
          <Field label="Title" htmlFor="c-title"><Input id="c-title" value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Description (optional)" htmlFor="c-desc"><Textarea id="c-desc" rows={3} maxLength={1000} value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
          {err && <Alert tone="danger">{err}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending}>{create.isPending ? "Creating…" : "Create"}</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

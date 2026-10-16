"use client";
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Alert, Card, PageHeader } from "@/components/ui/card";
import { StatusPill } from "./status-pill";
import { addFollowUp, codeOf, confirmResolution } from "@/lib/rpc/rpc";
import { fetchCourseIdOfSession, fetchRequest, fetchSnapshotCode, fetchThread, keys } from "@/lib/queries";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/content/copy";
import { RealtimeProvider } from "@/lib/realtime/provider";
import { dateTime } from "@/lib/format";

type Outcome = "cleared" | "partly" | "not_cleared";

function SaveToNotebook({ requestId, sessionId, defaultTitle, snapshotId, onDone }: {
  requestId: string; sessionId: string; defaultTitle: string; snapshotId: string | null | undefined; onDone: () => void;
}) {
  const [title, setTitle] = useState(defaultTitle.slice(0, 80));
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: async () => {
      const courseId = await fetchCourseIdOfSession(sessionId);
      const code = snapshotId ? await fetchSnapshotCode(snapshotId) : null;
      // student_id is filled by the column default (auth.uid()); RLS re-checks it.
      const { error } = await createClient().from("notebook_entries").insert({
        request_id: requestId, course_id: courseId, title: title.trim(), body: body.trim(), snapshot_code: code,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: keys.notebook() }); onDone(); },
    onError: () => setErr(errorMessage("generic")),
  });
  return (
    <Card className="space-y-2">
      <h2 className="font-medium">Keep this in your notebook</h2>
      <label className="block text-sm" htmlFor="nb-title">Title</label>
      <input id="nb-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-md border border-border bg-surface px-3 py-2" />
      <label className="block text-sm" htmlFor="nb-body">What did you learn? (in your own words)</label>
      <Textarea id="nb-body" value={body} maxLength={8000} rows={4} onChange={(e) => setBody(e.target.value)} />
      {err && <Alert tone="danger">{err}</Alert>}
      <Button disabled={!title.trim() || save.isPending} onClick={() => { setErr(null); save.mutate(); }}>{save.isPending ? "Saving…" : "Save"}</Button>
    </Card>
  );
}

export function RequestThread({ requestId, userId }: { requestId: string; userId: string }) {
  const qc = useQueryClient();
  const req = useQuery({ queryKey: keys.request(requestId), queryFn: () => fetchRequest(requestId), refetchInterval: 8_000 });
  const thread = useQuery({ queryKey: keys.thread(requestId), queryFn: () => fetchThread(requestId), refetchInterval: 8_000 });
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [showSave, setShowSave] = useState(false);

  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: keys.request(requestId) }),
    qc.invalidateQueries({ queryKey: keys.thread(requestId) }),
    qc.invalidateQueries({ queryKey: keys.myRequests() }),
  ]);

  const follow = useMutation({
    mutationFn: () => addFollowUp(requestId, text.trim()),
    onSuccess: async () => { setText(""); await refresh(); },
    onError: (e) => setErr(errorMessage(codeOf(e))),
  });
  const confirm = useMutation({
    mutationFn: (o: Outcome) => confirmResolution(requestId, o),
    onSuccess: async () => { await refresh(); },
    onError: (e) => setErr(errorMessage(codeOf(e))),
  });

  if (req.isLoading) return <p role="status">Loading…</p>;
  if (!req.data) return <Alert tone="danger">{errorMessage("not_found")}</Alert>;
  const r = req.data;
  const needsConfirm = r.status === "handled" && r.student_confirmed === null;

  return (
    <RealtimeProvider topics={[`user:${userId}:inbox`]}>
      <div className="mx-auto max-w-2xl space-y-4">
        <Link href="/student/help" className="text-sm underline">← My questions</Link>
        <PageHeader title="Your question"><StatusPill status={r.status} /></PageHeader>
        <ol className="space-y-2" aria-label="Conversation">
          <li className="rounded-lg border border-border bg-surface p-3">
            <p className="whitespace-pre-wrap text-sm">{r.message}</p>
            <p className="mt-1 text-xs text-text-3">You · {dateTime(r.created_at)}{r.is_anonymous ? " · anonymous" : ""}</p>
          </li>
          {thread.data?.map((m) => (
            <li key={m.id} className={m.sender_id === userId ? "rounded-lg border border-border bg-surface p-3" : "rounded-lg border border-accent/40 bg-accent-soft p-3"}>
              <p className="whitespace-pre-wrap text-sm">{m.body}</p>
              <p className="mt-1 text-xs text-text-3">{m.sender_id === userId ? "You" : m.kind === "system" ? "Update" : "Your teacher"}
                {m.kind === "hint" ? " · hint" : m.kind === "guiding_question" ? " · something to think about" : ""} · {dateTime(m.created_at)}</p>
            </li>
          ))}
        </ol>

        {err && <Alert tone="danger">{err}</Alert>}

        {needsConfirm && (
          <Card className="space-y-2">
            <h2 className="font-medium">Did that clear it up?</h2>
            <div className="flex flex-wrap gap-2">
              <Button disabled={confirm.isPending} onClick={() => confirm.mutate("cleared")}>Yes, cleared</Button>
              <Button variant="secondary" disabled={confirm.isPending} onClick={() => confirm.mutate("partly")}>Partly</Button>
              <Button variant="secondary" disabled={confirm.isPending} onClick={() => confirm.mutate("not_cleared")}>Still stuck</Button>
            </div>
          </Card>
        )}

        {r.student_confirmed === "cleared" && !saved && (
          showSave
            ? <SaveToNotebook requestId={requestId} sessionId={r.session_id} defaultTitle={r.message} snapshotId={r.snapshot_id} onDone={() => { setSaved(true); setShowSave(false); }} />
            : <Button variant="secondary" onClick={() => setShowSave(true)}>Save to my notebook</Button>
        )}
        {saved && <Alert tone="ok">Saved to your notebook.</Alert>}

        {r.status !== "handled" || r.student_confirmed !== null ? (
          <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) { setErr(null); follow.mutate(); } }} className="space-y-2">
            <label htmlFor="fu" className="text-sm font-medium">{r.student_confirmed === "not_cleared" || r.student_confirmed === "partly" ? "Tell your teacher what's still unclear" : "Add a follow-up"}</label>
            <Textarea id="fu" rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
            <Button type="submit" disabled={!text.trim() || follow.isPending}>{follow.isPending ? "Sending…" : "Send"}</Button>
          </form>
        ) : null}
      </div>
    </RealtimeProvider>
  );
}

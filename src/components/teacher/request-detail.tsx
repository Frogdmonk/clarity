"use client";
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/field";
import { Alert, Card, PageHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { StatusPill } from "@/components/help/status-pill";
import { DiffView } from "@/components/code/diff-view";
import { RealtimeProvider, type RealtimeEvent } from "@/lib/realtime/provider";
import {
  codeOf, getRequestSnapshot, getStudentDraft, replyToRequest, revealIdentity, setRequestStatus, teacherRequests, teacherThread,
} from "@/lib/rpc/rpc";
import { keys } from "@/lib/queries";
import { createClient } from "@/lib/supabase/client";
import { copy, errorMessage } from "@/content/copy";
import { dateTime } from "@/lib/format";
import { replySchema, noteSchema } from "@/lib/validation/schemas";
import type { RequestStatus } from "@/lib/types";

const NEXT: Record<RequestStatus, { to: RequestStatus; label: string }[]> = {
  open: [{ to: "in_progress", label: "Start helping" }, { to: "handled", label: "Mark handled" }],
  in_progress: [{ to: "handled", label: "Mark handled" }],
  handled: [{ to: "reopened", label: "Reopen" }],
  reopened: [{ to: "in_progress", label: "Start helping" }, { to: "handled", label: "Mark handled" }],
};

function Notes({ requestId, userId }: { requestId: string; userId: string }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const notes = useQuery({
    queryKey: ["notes", requestId],
    queryFn: async () => {
      const { data, error } = await createClient().from("help_request_notes").select("id,note,created_at").eq("request_id", requestId).order("created_at");
      if (error) throw new Error(error.message);
      return (data ?? []) as { id: string; note: string; created_at: string }[];
    },
  });
  const add = useMutation({
    mutationFn: async () => {
      const note = noteSchema.parse({ note: text }).note;
      const { error } = await createClient().from("help_request_notes").insert({ request_id: requestId, teacher_id: userId, note });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => { setText(""); await qc.invalidateQueries({ queryKey: ["notes", requestId] }); },
    onError: () => setErr(errorMessage("generic")),
  });
  return (
    <section aria-labelledby="notes-h" className="space-y-2 rounded-lg border-l-4 border-warn bg-surface-2 p-3">
      <h3 id="notes-h" className="text-sm font-medium">🔒 Private notes — only you can see these</h3>
      {notes.data?.map((n) => <p key={n.id} className="whitespace-pre-wrap text-sm">{n.note}<span className="block text-xs text-text-3">{dateTime(n.created_at)}</span></p>)}
      <label htmlFor="note" className="sr-only">Add a private note</label>
      <Textarea id="note" rows={2} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} />
      {err && <Alert tone="danger">{err}</Alert>}
      <Button variant="secondary" disabled={!text.trim() || add.isPending} onClick={() => { setErr(null); add.mutate(); }}>Save note</Button>
    </section>
  );
}

export function RequestDetail({ sessionId, requestId, userId }: { sessionId: string; requestId: string; userId: string }) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: keys.tRequests(sessionId), queryFn: () => teacherRequests(sessionId), refetchInterval: 8_000 });
  const thread = useQuery({ queryKey: keys.tThread(requestId), queryFn: () => teacherThread(requestId), refetchInterval: 8_000 });
  const r = list.data?.find((x) => x.request_id === requestId);
  const draft = useQuery({
    queryKey: ["tDraft", requestId], queryFn: () => getStudentDraft(requestId), enabled: !!r?.has_code,
  });
  const [snapId, setSnapId] = useState<string | null>(null);
  const [compare, setCompare] = useState(false);
  const [newerFlag, setNewerFlag] = useState(false);
  const [reply, setReply] = useState("");
  const [kind, setKind] = useState<"reply" | "hint" | "guiding_question">("reply");
  const [err, setErr] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState<RequestStatus | null>(null);
  const [revealOpen, setRevealOpen] = useState(false);

  const chosenId = snapId ?? draft.data?.request_snapshot_id ?? null;
  const snap = useQuery({
    queryKey: ["tSnap", requestId, chosenId], queryFn: () => getRequestSnapshot(requestId, chosenId as string), enabled: !!chosenId,
  });
  const headId = draft.data?.snapshots?.[0]?.id ?? null;
  const headSnap = useQuery({
    queryKey: ["tSnap", requestId, headId], queryFn: () => getRequestSnapshot(requestId, headId as string), enabled: compare && !!headId,
  });

  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: keys.tRequests(sessionId) }),
    qc.invalidateQueries({ queryKey: keys.tThread(requestId) }),
    qc.invalidateQueries({ queryKey: ["tDraft", requestId] }),
  ]);
  const onEvent = (e: RealtimeEvent) => {
    if (e.event === "draft_newer" && e.payload.request_id === requestId) setNewerFlag(true);
  };

  const send = useMutation({
    mutationFn: () => replyToRequest(requestId, replySchema.parse({ body: reply }).body, kind),
    onSuccess: async () => { setReply(""); await refresh(); },
    onError: (e) => setErr(errorMessage(codeOf(e))),
  });
  const status = useMutation({
    mutationFn: (to: RequestStatus) => setRequestStatus(requestId, to, r!.status),
    onSuccess: async () => { setPendingStatus(null); await refresh(); },
    onError: (e) => { setPendingStatus(null); setErr(codeOf(e) === "already_changed" ? "Someone else just changed this. Refreshed." : errorMessage(codeOf(e))); void refresh(); },
  });
  const reveal = useMutation({
    mutationFn: () => revealIdentity(requestId),
    onSuccess: async () => { setRevealOpen(false); await refresh(); },
    onError: (e) => { setRevealOpen(false); setErr(errorMessage(codeOf(e))); },
  });

  if (list.isLoading) return <p role="status">Loading…</p>;
  if (!r) return <Alert tone="danger">{errorMessage("not_found")}</Alert>;
  const canReveal = r.is_anonymous && r.anon_policy === "masked" && !r.identity_revealed;

  function requestStatus(to: RequestStatus) {
    setErr(null);
    if (reply.trim()) setPendingStatus(to); else status.mutate(to);
  }

  return (
    <RealtimeProvider topics={[`session:${sessionId}:teacher`]} onEvent={onEvent}>
      <div className="space-y-3">
        <Link href={`/teacher/sessions/${sessionId}`} className="text-sm underline">← Console</Link>
        <PageHeader title={r.display_name}><StatusPill status={r.status} /></PageHeader>
        {err && <Alert tone="danger">{err}</Alert>}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="space-y-3">
            <h2 className="font-medium">Question</h2>
            <p className="whitespace-pre-wrap text-sm">{r.message}</p>
            <p className="text-xs capitalize text-text-3">{r.category} · {dateTime(r.created_at)}{r.ug_number ? ` · ${r.ug_number}` : ""}</p>
            <ol className="space-y-2" aria-label="Conversation">
              {thread.data?.messages.map((m) => (
                <li key={m.id} className={`rounded-md p-2 text-sm ${m.mine ? "bg-accent-soft" : "bg-surface-2"}`}>
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <p className="text-xs text-text-3">{m.mine ? "You" : m.from === "student" ? "Student" : "System"} · {dateTime(m.created_at)}</p>
                </li>
              ))}
            </ol>
            {canReveal && <Button variant="secondary" onClick={() => setRevealOpen(true)}>Reveal identity…</Button>}
          </Card>

          <Card className="space-y-3">
            <h2 className="font-medium">Student&apos;s code</h2>
            {!r.has_code ? <p className="text-sm text-text-3">No code attached.</p> : (
              <>
                {newerFlag && <Alert tone="info">The student has a newer draft.
                  <Button variant="ghost" onClick={() => { setNewerFlag(false); setSnapId(null); void refresh(); }}>Load newer draft</Button></Alert>}
                <label htmlFor="ver" className="text-sm">Version</label>
                <Select id="ver" value={chosenId ?? ""} onChange={(e) => setSnapId(e.target.value || null)}>
                  {draft.data?.snapshots?.map((s) => <option key={s.id} value={s.id}>v{s.version} · {s.kind} · {dateTime(s.created_at)}{s.id === draft.data?.request_snapshot_id ? " (attached)" : ""}</option>)}
                </Select>
                {headId && chosenId && headId !== chosenId && (
                  <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> Compare with latest</label>
                )}
                {compare && snap.data && headSnap.data ? <DiffView before={snap.data.code} after={headSnap.data.code} />
                  : snap.data ? <pre tabIndex={0} className="max-h-[60vh] overflow-auto rounded-md bg-surface-2 p-2 font-mono text-xs"><code>{snap.data.code}</code></pre>
                  : <p className="text-sm text-text-3" role="status">Loading code…</p>}
              </>
            )}
          </Card>

          <Card className="space-y-3">
            <h2 className="font-medium">Reply</h2>
            <label htmlFor="tpl" className="text-sm">Start from a prompt</label>
            <Select id="tpl" value="" onChange={(e) => { if (e.target.value) setReply(e.target.value); }}>
              <option value="">Choose…</option>
              {copy.teacher.templates.map((t) => <option key={t} value={t}>{t.slice(0, 60)}</option>)}
            </Select>
            <Select aria-label="Reply type" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="reply">Reply</option><option value="hint">Hint</option><option value="guiding_question">Guiding question</option>
            </Select>
            <Textarea aria-label="Reply to student" rows={5} maxLength={4000} value={reply} onChange={(e) => setReply(e.target.value)} />
            <Button disabled={!reply.trim() || send.isPending} onClick={() => { setErr(null); send.mutate(); }}>{send.isPending ? "Sending…" : "Send reply"}</Button>
            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              {NEXT[r.status].map((n) => <Button key={n.to} variant="secondary" disabled={status.isPending} onClick={() => requestStatus(n.to)}>{n.label}</Button>)}
            </div>
            <Notes requestId={requestId} userId={userId} />
          </Card>
        </div>

        <Dialog open={!!pendingStatus} onClose={() => setPendingStatus(null)} title="You have an unsent reply">
          <p className="text-sm text-text-2">Change the status without sending it?</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPendingStatus(null)}>Go back</Button>
            <Button disabled={status.isPending} onClick={() => pendingStatus && status.mutate(pendingStatus)}>Change status</Button>
          </div>
        </Dialog>
        <Dialog open={revealOpen} onClose={() => setRevealOpen(false)} title="Reveal this student&apos;s identity?">
          <p className="text-sm text-text-2">The student is notified and the reveal is recorded in the audit log.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRevealOpen(false)}>Cancel</Button>
            <Button variant="danger" disabled={reveal.isPending} onClick={() => reveal.mutate()}>Reveal</Button>
          </div>
        </Dialog>
      </div>
    </RealtimeProvider>
  );
}

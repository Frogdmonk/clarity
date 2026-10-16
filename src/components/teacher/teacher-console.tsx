"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Alert, Card, Empty, PageHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { PulseMeter } from "@/components/signals/pulse-meter";
import { StatusPill } from "@/components/help/status-pill";
import { PollManager } from "./poll-manager";
import { ConnectionBadge, RealtimeProvider } from "@/lib/realtime/provider";
import {
  addressCluster, codeOf, endSession, openQaWindow, pauseQuestions, rotateJoinCode, setTopic, startSession, teacherRequests, teacherSessionStats,
} from "@/lib/rpc/rpc";
import { fetchClusters, fetchJoinCode, fetchPulse, fetchSession, fetchTopics, keys } from "@/lib/queries";
import { errorMessage } from "@/content/copy";
import { minutesSince, waitLabel } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import type { TeacherRequest } from "@/lib/types";

const LOST_ALERT_SHARE = 0.3;

export function TeacherConsole({ sessionId }: { sessionId: string }) {
  const qc = useQueryClient();
  const router = useRouter();
  const now = useNow(15_000);
  const session = useQuery({ queryKey: keys.session(sessionId), queryFn: () => fetchSession(sessionId), refetchInterval: 15_000 });
  const pulse = useQuery({ queryKey: ["pulseT", sessionId], queryFn: () => fetchPulse(sessionId), refetchInterval: 5_000 });
  const stats = useQuery({ queryKey: keys.stats(sessionId), queryFn: () => teacherSessionStats(sessionId), refetchInterval: 10_000 });
  const reqs = useQuery({ queryKey: keys.tRequests(sessionId), queryFn: () => teacherRequests(sessionId), refetchInterval: 6_000 });
  const clusters = useQuery({ queryKey: keys.clusters(sessionId), queryFn: () => fetchClusters(sessionId), refetchInterval: 10_000 });
  const topics = useQuery({ queryKey: keys.topics(sessionId), queryFn: () => fetchTopics(sessionId) });
  const code = useQuery({ queryKey: keys.joinCode(sessionId), queryFn: () => fetchJoinCode(sessionId) });

  const [err, setErr] = useState<string | null>(null);
  const [topicText, setTopicText] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [addrFor, setAddrFor] = useState<string | null>(null);
  const [addrNote, setAddrNote] = useState("");
  const [filter, setFilter] = useState<"active" | "all">("active");
  const [sel, setSel] = useState(0);

  const s = session.data;
  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: keys.session(sessionId) }),
    qc.invalidateQueries({ queryKey: keys.tRequests(sessionId) }),
    qc.invalidateQueries({ queryKey: keys.clusters(sessionId) }),
    qc.invalidateQueries({ queryKey: keys.topics(sessionId) }),
    qc.invalidateQueries({ queryKey: keys.joinCode(sessionId) }),
  ]);
  const run = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: refresh,
    onError: (e) => setErr(errorMessage(codeOf(e))),
  });

  const list = useMemo(() => {
    const all = reqs.data ?? [];
    const rows = filter === "active" ? all.filter((r) => r.status !== "handled") : all;
    return [...rows].sort((a, b) => (b.priority - a.priority) || a.created_at.localeCompare(b.created_at));
  }, [reqs.data, filter]);

  // Keyboard: J/K move, Enter/R open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "j") setSel((i) => Math.min(i + 1, Math.max(list.length - 1, 0)));
      else if (e.key === "k") setSel((i) => Math.max(i - 1, 0));
      else if ((e.key === "r" || e.key === "n") && list[sel]) router.push(`/teacher/sessions/${sessionId}/requests/${list[sel].request_id}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [list, sel, sessionId, router]);

  if (session.isLoading) return <p role="status">Loading…</p>;
  if (!s) return <Alert tone="danger">{errorMessage("not_found")}</Alert>;

  const p = pulse.data;
  const total = p ? p.understand + p.partial + p.lost : 0;
  const lostAlert = !!p && s.status === "live" && total >= 5 && p.lost / total >= LOST_ALERT_SHARE;
  const handled = (reqs.data ?? []).filter((r) => r.handled_at);
  const waits = handled.map((r) => minutesSince(r.created_at, new Date(r.handled_at as string).getTime())).sort((a, b) => a - b);
  const median = waits.length ? waits[Math.floor(waits.length / 2)] : null;
  const live = s.status === "live";
  const clusterOf = (id: string | null) => clusters.data?.find((c) => c.id === id);

  return (
    <RealtimeProvider topics={[`session:${sessionId}:teacher`, `session:${sessionId}:public`]}>
      <div className="space-y-4">
        <PageHeader title={`${s.courses.title} · ${s.title}`}>
          <ConnectionBadge />
          <Link href={`/teacher/sessions/${sessionId}/present`} className="rounded-md border border-border px-3 py-2 text-sm" target="_blank">Presenter view</Link>
        </PageHeader>
        {err && <Alert tone="danger">{err}</Alert>}

        <Card className="flex flex-wrap items-center gap-3">
          <span className="text-sm capitalize">Status: <strong>{s.status}</strong></span>
          {s.status === "scheduled" && <Button disabled={run.isPending} onClick={() => { setErr(null); run.mutate(() => startSession(sessionId, s.version)); }}>Start session</Button>}
          {live && (
            <>
              <Button variant="secondary" disabled={run.isPending} onClick={() => { setErr(null); run.mutate(() => pauseQuestions(sessionId, !s.questions_paused)); }}>
                {s.questions_paused ? "Resume questions" : "Pause questions"}
              </Button>
              <Button variant="secondary" disabled={run.isPending} onClick={() => { setErr(null); run.mutate(() => openQaWindow(sessionId, !s.qa_window_open)); }}>
                {s.qa_window_open ? "Close Q&A window" : "Open Q&A window"}
              </Button>
              <Button variant="secondary" disabled={run.isPending} onClick={() => { setErr(null); run.mutate(() => rotateJoinCode(sessionId)); }}>New join code</Button>
              <Button variant="danger" onClick={() => setConfirmEnd(true)}>End session</Button>
            </>
          )}
          {s.status === "ended" && <Link className="underline" href={`/teacher/sessions/${sessionId}/summary`}>View summary</Link>}
          <span className="ml-auto text-sm text-text-2">
            Code <span className="font-mono text-lg tracking-widest">{code.data ?? "—"}</span>
            {stats.data && <> · {stats.data.connected} here · {stats.data.joined}/{stats.data.enrolled} joined</>}
          </span>
        </Card>

        {lostAlert && <Alert tone="warn">About {Math.round((p.lost / total) * 100)}% of responding students say they&apos;re lost. Consider pausing to recap.</Alert>}

        <div className="grid gap-4 lg:grid-cols-[320px_1fr_340px]">
          <div className="space-y-4">
            <Card className="space-y-3">
              <h2 className="font-medium">Class pulse</h2>
              {p ? <PulseMeter understand={p.understand} partial={p.partial} lost={p.lost} total={Math.max(total, 1)} /> : <p className="text-sm text-text-3">No responses yet.</p>}
              <p className="text-xs text-text-3">{total} response{total === 1 ? "" : "s"}</p>
            </Card>
            <Card className="space-y-2">
              <h2 className="font-medium">Topic marker</h2>
              <p className="text-sm text-text-2">Current: {topics.data?.find((t) => t.id === s.current_topic_id)?.label ?? "none"}</p>
              <form onSubmit={(e) => { e.preventDefault(); setErr(null); run.mutate(async () => { await setTopic(sessionId, topicText.trim() || null); setTopicText(""); }); }} className="flex gap-2">
                <label htmlFor="topic" className="sr-only">New topic</label>
                <Input id="topic" value={topicText} maxLength={120} placeholder="e.g. Recursion" onChange={(e) => setTopicText(e.target.value)} />
                <Button type="submit" disabled={!live || !topicText.trim() || run.isPending}>Set</Button>
              </form>
            </Card>
            <Card className="space-y-1">
              <h2 className="font-medium">Response time</h2>
              <p className="text-sm text-text-2">{median == null ? "No handled questions yet." : `Median wait: ${Math.round(median)} min across ${waits.length} handled.`}</p>
            </Card>
            <PollManager sessionId={sessionId} live={live} />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">Question queue ({list.length})</h2>
              <div role="group" aria-label="Filter" className="flex gap-1">
                <Button variant={filter === "active" ? "primary" : "secondary"} aria-pressed={filter === "active"} onClick={() => setFilter("active")}>Active</Button>
                <Button variant={filter === "all" ? "primary" : "secondary"} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All</Button>
              </div>
            </div>
            <p className="text-xs text-text-3">Keys: J/K move · R or N open</p>
            {!list.length ? <Empty>Nothing waiting. Nice.</Empty> : (
              <ul className="space-y-2">
                {list.map((r, i) => <QueueRow key={r.request_id} r={r} sid={sessionId} now={now} selected={i === sel} cluster={clusterOf(r.cluster_id)?.label} />)}
              </ul>
            )}
          </div>

          <div className="space-y-3">
            <h2 className="font-medium">Similar questions</h2>
            {!clusters.data?.length ? <p className="text-sm text-text-3">Groups appear when several students ask about the same thing.</p> : clusters.data.map((c) => {
              const members = (reqs.data ?? []).filter((r) => r.cluster_id === c.id);
              return (
                <Card key={c.id} className="space-y-2">
                  <div className="flex items-start justify-between gap-2"><p className="text-sm font-medium">{c.label}</p><span className="text-xs text-text-3">{members.length} students</span></div>
                  {c.addressed_at
                    ? <p className="text-xs text-ok">Addressed{c.addressed_note ? `: ${c.addressed_note}` : ""}</p>
                    : <Button variant="secondary" disabled={!live} onClick={() => { setAddrFor(c.id); setAddrNote(""); }}>Answer everyone at once</Button>}
                </Card>
              );
            })}
          </div>
        </div>

        <Dialog open={confirmEnd} onClose={() => setConfirmEnd(false)} title="End this session?">
          <p className="text-sm text-text-2">Students can still use the Doubt Bank for the window set in course settings.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmEnd(false)}>Keep going</Button>
            <Button variant="danger" disabled={run.isPending} onClick={() => { setConfirmEnd(false); setErr(null); run.mutate(() => endSession(sessionId, s.version)); }}>End session</Button>
          </div>
        </Dialog>
        <Dialog open={!!addrFor} onClose={() => setAddrFor(null)} title="Answer the whole group">
          <form onSubmit={(e) => { e.preventDefault(); const id = addrFor; if (!id) return; setAddrFor(null); setErr(null); run.mutate(() => addressCluster(id, addrNote.trim())); }} className="space-y-3">
            <Field label="Short note students will see (e.g. “Covered on the board”)" htmlFor="an"><Textarea id="an" rows={3} maxLength={500} value={addrNote} onChange={(e) => setAddrNote(e.target.value)} /></Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setAddrFor(null)}>Cancel</Button>
              <Button type="submit" disabled={!addrNote.trim()}>Send to all</Button>
            </div>
          </form>
        </Dialog>
      </div>
    </RealtimeProvider>
  );
}

function QueueRow({ r, sid, now, selected, cluster }: { r: TeacherRequest; sid: string; now: number; selected: boolean; cluster?: string }) {
  return (
    <li>
      <Link href={`/teacher/sessions/${sid}/requests/${r.request_id}`}
        className={`block rounded-lg border bg-surface p-3 hover:bg-surface-2 ${selected ? "border-accent ring-2 ring-accent/40" : "border-border"}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2"><StatusPill status={r.status} /><span className="text-sm font-medium">{r.display_name}</span></span>
          <span className="text-xs text-text-3">{waitLabel(r.created_at, now)}</span>
        </div>
        <p className="mt-1 line-clamp-2 text-sm">{r.message}</p>
        <p className="mt-1 text-xs capitalize text-text-3">{r.category}{r.has_code ? " · has code" : ""}{r.is_doubt_bank ? " · Doubt Bank" : ""}{cluster ? ` · group: ${cluster}` : ""}</p>
      </Link>
    </li>
  );
}

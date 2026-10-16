"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Alert, Empty } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UnderstandingBar } from "@/components/signals/understanding-bar";
import { PulseMeter } from "@/components/signals/pulse-meter";
import { RequestComposer } from "@/components/help/request-composer";
import { RequestCard } from "@/components/help/request-card";
import { PollCard } from "@/components/session/poll-card";
import { ExitTicket } from "@/components/session/exit-ticket";
import { ConnectionBadge, RealtimeProvider, type RealtimeEvent } from "@/lib/realtime/provider";
import { useHeartbeat } from "@/lib/use-heartbeat";
import { useNow } from "@/lib/use-now";
import { copy, errorMessage } from "@/content/copy";
import {
  doubtBankHoursLeft, fetchActivities, fetchMembership, fetchMyRequests, fetchMySignal, fetchSession, fetchTopics, keys,
} from "@/lib/queries";
import { codeOf, getPulseAfterCommit, getSessionPolls, joinSession, setSignal } from "@/lib/rpc/rpc";
import { queueSignal, takeQueuedSignal } from "@/lib/drafts/outbox";
import { NetworkError } from "@/lib/drafts/saver";
import type { Understanding } from "@/lib/types";

export function StudentSessionView({ sessionId, userId }: { sessionId: string; userId: string }) {
  const [notice, setNotice] = useState<string | null>(null);
  const onEvent = useCallback((e: RealtimeEvent) => {
    const map: Record<string, string> = {
      reply: "Your teacher replied.",
      status: e.payload.status === "handled" ? "Your question was marked handled. Did it clear things up?" : "Your question was updated.",
      addressed: copy.closeLoop.addressed,
      identity_revealed: copy.closeLoop.revealed,
      poll_state: "A poll just opened or changed.",
    };
    const msg = map[e.event];
    if (msg) setNotice(msg);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 7000);
    return () => clearTimeout(t);
  }, [notice]);

  return (
    <RealtimeProvider topics={[`session:${sessionId}:public`, `user:${userId}:inbox`]} onEvent={onEvent}>
      <div aria-live="polite" className="min-h-0">{notice && <div className="mb-3"><Alert tone="info">{notice}</Alert></div>}</div>
      <Inner sessionId={sessionId} userId={userId} />
    </RealtimeProvider>
  );
}

function Inner({ sessionId, userId }: { sessionId: string; userId: string }) {
  const qc = useQueryClient();
  const [composer, setComposer] = useState(false);
  const [signalMsg, setSignalMsg] = useState<string | null>(null);

  const session = useQuery({ queryKey: keys.session(sessionId), queryFn: () => fetchSession(sessionId), refetchInterval: 8000 });
  const member = useQuery({ queryKey: keys.membership(sessionId), queryFn: () => fetchMembership(sessionId) });
  const topics = useQuery({ queryKey: keys.topics(sessionId), queryFn: () => fetchTopics(sessionId), refetchInterval: 15000 });
  const activities = useQuery({ queryKey: keys.activities(sessionId), queryFn: () => fetchActivities(sessionId), refetchInterval: 15000 });
  const mySignal = useQuery({ queryKey: keys.mySignal(sessionId), queryFn: () => fetchMySignal(sessionId) });
  const requests = useQuery({ queryKey: keys.myRequests(sessionId), queryFn: () => fetchMyRequests(sessionId), refetchInterval: 10000 });
  const s = session.data;
  const live = s?.status === "live";
  const ended = s?.status === "ended";
  const isMember = member.data === true;

  const pulse = useQuery({
    queryKey: keys.pulseAfter(sessionId), queryFn: () => getPulseAfterCommit(sessionId),
    enabled: isMember && live, refetchInterval: 6000,
  });
  const polls = useQuery({
    queryKey: keys.polls(sessionId), queryFn: () => getSessionPolls(sessionId), enabled: isMember, refetchInterval: 10000,
  });

  useHeartbeat(sessionId, live && isMember);

  const join = useMutation({
    mutationFn: () => joinSession(sessionId),
    onSuccess: (r) => {
      if (!r.ok) setSignalMsg(errorMessage(r.error));
      else void qc.invalidateQueries({ queryKey: keys.membership(sessionId) });
    },
    onError: (e) => setSignalMsg(errorMessage(codeOf(e))),
  });

  const signal = useMutation({
    mutationFn: async (v: Understanding) => {
      try {
        await setSignal(sessionId, v, s?.current_topic_id ?? null);
        return "sent" as const;
      } catch (e) {
        if (e instanceof NetworkError) {
          await queueSignal(userId, sessionId, v);
          return "queued" as const;
        }
        throw e;
      }
    },
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: keys.mySignal(sessionId) });
      const prev = qc.getQueryData<Understanding | null>(keys.mySignal(sessionId));
      qc.setQueryData(keys.mySignal(sessionId), v); // optimistic
      return { prev };
    },
    onSuccess: (res) => {
      setSignalMsg(res === "queued" ? copy.errors.offline : copy.signal.sent);
      void qc.invalidateQueries({ queryKey: keys.pulseAfter(sessionId) });
    },
    onError: (e, _v, ctx) => {
      qc.setQueryData(keys.mySignal(sessionId), ctx?.prev ?? null);
      setSignalMsg(errorMessage(codeOf(e)));
    },
  });

  // Flush a signal queued while offline.
  useEffect(() => {
    const flush = async () => {
      const v = await takeQueuedSignal(userId, sessionId);
      if (!v) return;
      try {
        await setSignal(sessionId, v as Understanding, s?.current_topic_id ?? null);
        void qc.invalidateQueries({ queryKey: keys.mySignal(sessionId) });
      } catch {
        await queueSignal(userId, sessionId, v);
      }
    };
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [userId, sessionId, s?.current_topic_id, qc]);

  const now = useNow();
  const topicLabel = topics.data?.find((t) => t.id === s?.current_topic_id)?.label;

  if (session.isLoading) return <p role="status">Loading…</p>;
  if (session.error || !s) return <Alert tone="danger">{copy.errors.permission_denied}</Alert>;

  const anonMode = s.courses.settings.anonymity_mode;
  const hoursLeft = doubtBankHoursLeft(s, now);
  const canAskLater = ended && hoursLeft > 0;
  const exitOn = s.courses.settings.behaviour?.exit_ticket !== false;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <header className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">{s.courses.title} · {s.title}</h1>
          {live && <ConnectionBadge />}
        </div>
        {topicLabel && <p className="text-sm text-text-2">Topic: <span className="rounded bg-surface-2 px-2 py-0.5 font-medium">{topicLabel}</span></p>}
        {s.status === "scheduled" && <Alert tone="info">This session hasn&apos;t started yet.</Alert>}
        {ended && <Alert tone="info">This session has ended.{canAskLater ? " You can still use Ask later for a little while." : ` ${copy.errors.session_ended}`}</Alert>}
      </header>

      {live && !isMember && !member.isLoading && (
        <Card className="space-y-3">
          <p>You haven&apos;t joined this session yet.</p>
          <Button onClick={() => join.mutate()} disabled={join.isPending}>Join session</Button>
          {signalMsg && <Alert tone="warn">{signalMsg}</Alert>}
        </Card>
      )}

      {live && isMember && (
        <>
          {s.qa_window_open && <Alert tone="ok">{copy.ask.qaOpen}</Alert>}
          {s.questions_paused && <Alert tone="warn">{copy.ask.paused}</Alert>}

          <Card className="space-y-3">
            <h2 className="font-medium">{copy.signal.heading}</h2>
            <UnderstandingBar value={mySignal.data ?? null} onSelect={(v) => signal.mutate(v)} disabled={signal.isPending} />
            <div aria-live="polite" className="min-h-[1.25rem] text-sm text-text-2">{signalMsg}</div>
            {mySignal.data && pulse.data?.revealed ? (
              <div className="space-y-2">
                <PulseMeter understand={pulse.data.understand} partial={pulse.data.partial} lost={pulse.data.lost} total={pulse.data.total ?? 0} />
                {pulse.data.others_lost_on_topic != null && topicLabel && (
                  <p className="text-sm">{copy.signal.othersOnTopic(pulse.data.others_lost_on_topic, topicLabel)}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-text-3">{copy.signal.pulseHidden}</p>
            )}
          </Card>

          <Button block onClick={() => setComposer(true)} disabled={s.questions_paused}>{copy.ask.button}</Button>
        </>
      )}

      {canAskLater && <Button block variant="secondary" onClick={() => setComposer(true)}>{copy.ask.later}</Button>}

      {polls.data && polls.data.length > 0 && (
        <section aria-labelledby="polls-h" className="space-y-3">
          <h2 id="polls-h" className="font-medium">Polls</h2>
          {polls.data.map((p) => <PollCard key={p.id} poll={p} sessionId={sessionId} />)}
        </section>
      )}

      {(activities.data?.length ?? 0) > 0 && (
        <section aria-labelledby="act-h" className="space-y-2">
          <h2 id="act-h" className="font-medium">Coding activities</h2>
          {activities.data?.map((a) => (
            <Link key={a.id} href={`/student/sessions/${sessionId}/activity/${a.id}`}
              className="flex min-h-[44px] items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 hover:bg-surface-2">
              <span>{a.title}</span>
              <span className="text-xs text-text-3">{a.closed ? "Closed" : a.due_at ? `Due ${new Date(a.due_at).toLocaleString()}` : "Open"}</span>
            </Link>
          ))}
        </section>
      )}

      {ended && exitOn && isMember && <ExitTicket sessionId={sessionId} />}

      <section aria-labelledby="mine-h" className="space-y-2">
        <h2 id="mine-h" className="font-medium">My questions here ({requests.data?.length ?? 0})</h2>
        {requests.data?.length ? requests.data.map((r) => <RequestCard key={r.id} r={r} now={now} />) : <Empty>{copy.empty.questions}</Empty>}
      </section>

      <RequestComposer
        open={composer} onClose={() => setComposer(false)} sessionId={sessionId} anonMode={anonMode}
        topicId={s.current_topic_id} activities={activities.data ?? []} doubtBank={ended}
      />
    </div>
  );
}

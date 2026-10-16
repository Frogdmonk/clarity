"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Alert } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { CodeEditor } from "./code-editor-lazy";
import { SaveIndicator } from "./save-indicator";
import { ConflictDialog } from "./conflict-dialog";
import { DiffView } from "./diff-view";
import { RequestComposer } from "@/components/help/request-composer";
import { DraftSaver, NetworkError, RpcCodeError, type SaverDeps } from "@/lib/drafts/saver";
import { getDeviceId, getLocalDraft, putLocalDraft } from "@/lib/drafts/outbox";
import { codeOf, saveDraftRpc, snapshotMyCode, submitCode } from "@/lib/rpc/rpc";
import { createClient } from "@/lib/supabase/client";
import { fetchActivities, fetchSession, keys } from "@/lib/queries";
import { copy, errorMessage } from "@/content/copy";
import { dateTime } from "@/lib/format";
import type { Activity } from "@/lib/types";

interface Init { code: string; baseRev: number; unsynced: boolean; deviceId: string }

export function ActivityWorkspace({ sessionId, activityId, userId }: { sessionId: string; activityId: string; userId: string }) {
  const activities = useQuery({ queryKey: keys.activities(sessionId), queryFn: () => fetchActivities(sessionId) });
  const activity = activities.data?.find((a) => a.id === activityId);

  const init = useQuery({
    queryKey: ["draftInit", activityId],
    enabled: !!activity,
    staleTime: Infinity, gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false,
    queryFn: async (): Promise<Init> => {
      const deviceId = await getDeviceId();
      const local = await getLocalDraft(userId, activityId);
      let server: { code: string; rev: number } | null = null;
      try {
        const { data } = await createClient().from("code_drafts").select("code, rev").eq("activity_id", activityId).maybeSingle();
        if (data) server = { code: data.code as string, rev: data.rev as number };
      } catch { /* offline: fall back to the local copy */ }
      if (local?.dirty) return { code: local.code, baseRev: local.baseRev, unsynced: true, deviceId };
      if (server) return { code: server.code, baseRev: server.rev, unsynced: false, deviceId };
      return { code: activity?.starter_code ?? "", baseRev: 0, unsynced: false, deviceId };
    },
  });

  if (activities.isLoading || init.isLoading) return <p role="status">Loading…</p>;
  if (!activity || !init.data) return <Alert tone="danger">{copy.errors.not_found}</Alert>;
  return <Workspace sessionId={sessionId} userId={userId} activity={activity} init={init.data} />;
}

function Workspace({ sessionId, userId, activity, init }: { sessionId: string; userId: string; activity: Activity; init: Init }) {
  const qc = useQueryClient();
  const [saver] = useState(() => {
    const deps: SaverDeps = {
      save: async (code, baseRev, deviceId) => saveDraftRpc(activity.id, code, baseRev, deviceId),
      park: async (code) => { await snapshotMyCode(activity.id, code); },
      putLocal: (d) => putLocalDraft(userId, activity.id, d),
      deviceId: init.deviceId,
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      random: Math.random,
      now: () => Date.now(),
    };
    return new DraftSaver(deps, { code: init.code, baseRev: init.baseRev, unsynced: init.unsynced });
  });
  const view = useSyncExternalStore(saver.subscribe, saver.getSnapshot, saver.getSnapshot);

  const [composer, setComposer] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [submitKey, setSubmitKey] = useState(() => crypto.randomUUID());
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [compare, setCompare] = useState<{ version: number; code: string } | null>(null);

  const session = useQuery({ queryKey: keys.session(sessionId), queryFn: () => fetchSession(sessionId) });

  useEffect(() => {
    const onOnline = () => saver.online();
    const onHide = () => { if (document.visibilityState === "hidden") void saver.flush(); };
    const onPageHide = () => { void saver.flush(); }; // the local buffer already holds the text if this does not finish
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      saver.dispose();
    };
  }, [saver]);

  const snapshots = useQuery({
    queryKey: ["snapshots", activity.id],
    queryFn: async () => {
      const { data, error } = await createClient().from("code_snapshots").select("id, version, kind, created_at")
        .eq("activity_id", activity.id).order("version", { ascending: false }).limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []) as { id: string; version: number; kind: "autosave" | "request" | "submission"; created_at: string }[];
    },
    refetchInterval: 30_000,
  });

  const submit = useMutation({
    mutationFn: async () => {
      await saver.flush();
      const snap = saver.getSnapshot();
      if (snap.status.kind === "conflict") throw new RpcCodeError("already_changed");
      return submitCode(activity.id, snap.code, submitKey);
    },
    onSuccess: (r) => {
      setConfirm(false); setSubmitErr(null); setSubmitKey(crypto.randomUUID());
      setSubmitMsg(`Submission #${r.version} · ${dateTime(r.created_at)} · latest`);
      void qc.invalidateQueries({ queryKey: ["snapshots", activity.id] });
    },
    onError: (e) => setSubmitErr(e instanceof NetworkError ? copy.errors.offline : errorMessage(codeOf(e))),
  });

  async function loadVersion(id: string, version: number) {
    const { data } = await createClient().from("code_snapshots").select("code").eq("id", id).single();
    if (data) setCompare({ version, code: data.code as string });
  }

  const closed = activity.closed;
  const lastSubmission = snapshots.data?.find((s) => s.kind === "submission");
  const conflict = view.status.kind === "conflict" ? view.status.server : null;

  return (
    <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">{activity.title}</h1>
          <Link href={`/student/sessions/${sessionId}`} className="text-sm underline">Back to session</Link>
        </div>
        <Card>
          <p className="whitespace-pre-wrap text-sm">{activity.statement}</p>
          {activity.due_at && <p className="mt-2 text-xs text-text-3">Due {dateTime(activity.due_at)}</p>}
        </Card>
        {closed && <Alert tone="warn">{copy.errors.activity_closed}</Alert>}

        <CodeEditor value={view.code} onChange={(c) => saver.edit(c)} readOnly={closed} language={activity.language}
          label={`Code for ${activity.title}. Press Escape then Tab to leave the editor.`} />
        <p className="text-xs text-text-3">Tab indents. To move on with the keyboard, press Esc, then Tab.</p>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <SaveIndicator status={view.status} onRetry={() => void saver.flush()} />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void saver.flush()} disabled={closed}>Save</Button>
            <Button variant="secondary" onClick={() => setComposer(true)} disabled={session.data?.questions_paused}>Ask about this</Button>
            <Button onClick={() => { setSubmitErr(null); setConfirm(true); }} disabled={closed}>Submit</Button>
          </div>
        </div>
        {submitMsg && <Alert tone="ok">{submitMsg}</Alert>}
      </div>

      <aside className="space-y-3" aria-label="Versions">
        <Card className="space-y-2">
          <h2 className="font-medium">History</h2>
          {lastSubmission && <p className="text-xs text-text-2">Latest submission: version {lastSubmission.version}, {dateTime(lastSubmission.created_at)}</p>}
          <ul className="max-h-72 space-y-1 overflow-auto">
            {snapshots.data?.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => void loadVersion(s.id, s.version)}
                  className="flex min-h-[44px] w-full items-center justify-between rounded-md border border-border px-3 text-left text-sm hover:bg-surface-2">
                  <span>v{s.version} · {s.kind === "request" ? "when you asked" : s.kind}</span>
                  <span className="text-xs text-text-3">{dateTime(s.created_at)}</span>
                </button>
              </li>
            ))}
            {!snapshots.data?.length && <li className="text-sm text-text-3">History appears as you work.</li>}
          </ul>
        </Card>
        {compare && (
          <Card className="space-y-2">
            <h2 className="font-medium">v{compare.version} compared with now</h2>
            <DiffView before={compare.code} after={view.code} />
            <div className="flex gap-2">
              <Button variant="secondary" disabled={closed} onClick={() => { saver.edit(compare.code); setCompare(null); }}>Restore v{compare.version}</Button>
              <Button variant="ghost" onClick={() => setCompare(null)}>Close</Button>
            </div>
          </Card>
        )}
      </aside>

      <Dialog open={confirm} onClose={() => setConfirm(false)} title="Submit this version?">
        <p className="text-sm text-text-2">Your current code is saved as a new, permanent submission. You can submit again later; every submission is kept.</p>
        {submitErr && <Alert tone="danger">{submitErr}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirm(false)}>Not yet</Button>
          <Button onClick={() => submit.mutate()} disabled={submit.isPending}>{submit.isPending ? "Submitting…" : "Submit"}</Button>
        </div>
      </Dialog>

      <ConflictDialog server={conflict} onResolve={(c) => void saver.resolve(c)} />

      {session.data && (
        <RequestComposer
          open={composer} onClose={() => setComposer(false)} sessionId={sessionId}
          anonMode={session.data.courses.settings.anonymity_mode} topicId={session.data.current_topic_id}
          activities={[activity]} defaultActivityId={activity.id} doubtBank={session.data.status === "ended"}
          onBeforeSend={() => saver.flush()}
        />
      )}
    </div>
  );
}

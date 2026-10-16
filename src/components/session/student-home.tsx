"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card, Empty, PageHeader } from "@/components/ui/card";
import { JoinForm } from "./join-form";
import { doubtBankHoursLeft, fetchLiveAndRecentSessions, fetchMyRequests, keys } from "@/lib/queries";
import { usePref } from "@/lib/use-pref";
import { useNow } from "@/lib/use-now";
import { Button } from "@/components/ui/button";

/** B14: private, never compared to anyone, with an off switch. */
function ClarityView() {
  const [hidden, setHidden] = usePref("clarity:hideProgress", "0");
  const now = useNow(60_000);
  const reqs = useQuery({ queryKey: keys.myRequests(), queryFn: () => fetchMyRequests() });
  if (hidden === "1") return <button type="button" onClick={() => setHidden("0")} className="text-xs underline">Show my weekly view</button>;
  const week = (reqs.data ?? []).filter((r) => now - new Date(r.created_at).getTime() < 7 * 86_400_000);
  const cleared = week.filter((r) => r.student_confirmed === "cleared").length;
  const open = week.filter((r) => r.status !== "handled").length;
  return (
    <Card className="space-y-1">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">This week, just for you</h2>
        <Button variant="ghost" onClick={() => setHidden("1")}>Hide</Button>
      </div>
      <p className="text-sm" aria-live="polite">{week.length} doubts raised, {cleared} cleared, {open} open.</p>
      <p className="text-xs text-text-3">Only you can see this. It is never compared with anyone.</p>
    </Card>
  );
}

export function StudentHome() {
  const now = useNow(60_000);
  const sessions = useQuery({ queryKey: keys.liveSessions(), queryFn: fetchLiveAndRecentSessions, refetchInterval: 10_000 });
  const live = sessions.data?.filter((s) => s.status === "live") ?? [];
  const recent = sessions.data?.filter((s) => s.status === "ended" && doubtBankHoursLeft(s, now) > 0) ?? [];
  return (
    <div className="space-y-5">
      <PageHeader title="Home" />
      <section aria-labelledby="live-h" className="space-y-2">
        <h2 id="live-h" className="font-medium">Live now</h2>
        {live.length ? live.map((s) => (
          <Link key={s.id} href={`/student/sessions/${s.id}`} className="flex min-h-[56px] items-center justify-between rounded-lg border-2 border-accent bg-surface px-4 py-3">
            <span><span className="font-medium">{s.courses.title}</span> · {s.title}</span>
            <span className="text-sm font-medium text-accent">Join →</span>
          </Link>
        )) : <Empty>Nothing live right now. Have a class code? Enter it below.</Empty>}
      </section>
      <section aria-labelledby="code-h" className="space-y-2">
        <h2 id="code-h" className="font-medium">Join with a code</h2>
        <Card><JoinForm scanner /></Card>
      </section>
      {recent.length > 0 && (
        <section aria-labelledby="later-h" className="space-y-2">
          <h2 id="later-h" className="font-medium">Ask later (Doubt Bank)</h2>
          {recent.map((s) => (
            <Link key={s.id} href={`/student/sessions/${s.id}`} className="flex min-h-[44px] items-center justify-between rounded-lg border border-border bg-surface px-4 py-2 hover:bg-surface-2">
              <span>{s.courses.title} · {s.title}</span>
              <span className="text-xs text-text-3">{Math.ceil(doubtBankHoursLeft(s, now))}h left</span>
            </Link>
          ))}
        </section>
      )}
      <ClarityView />
    </div>
  );
}

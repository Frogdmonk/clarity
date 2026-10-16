"use client";
import { useQuery } from "@tanstack/react-query";
import { Empty, PageHeader } from "@/components/ui/card";
import { RequestCard } from "./request-card";
import { fetchMyRequests, keys } from "@/lib/queries";
import { useNow } from "@/lib/use-now";
import { copy } from "@/content/copy";
import { RealtimeProvider, ConnectionBadge } from "@/lib/realtime/provider";

export function StudentRequests({ userId }: { userId: string }) {
  const now = useNow();
  const q = useQuery({ queryKey: keys.myRequests(), queryFn: () => fetchMyRequests(), refetchInterval: 10_000 });
  const open = q.data?.filter((r) => r.status !== "handled") ?? [];
  const done = q.data?.filter((r) => r.status === "handled") ?? [];
  return (
    <RealtimeProvider topics={[`user:${userId}:inbox`]}>
      <PageHeader title="My questions"><ConnectionBadge /></PageHeader>
      {q.isLoading ? <p role="status">Loading…</p> : !q.data?.length ? <Empty>{copy.empty.questions}</Empty> : (
        <div className="space-y-6">
          <section aria-labelledby="o-h" className="space-y-2">
            <h2 id="o-h" className="font-medium">Waiting or in progress ({open.length})</h2>
            {open.map((r) => <RequestCard key={r.id} r={r} now={now} />)}
          </section>
          <section aria-labelledby="d-h" className="space-y-2">
            <h2 id="d-h" className="font-medium">Handled ({done.length})</h2>
            {done.map((r) => <RequestCard key={r.id} r={r} now={now} />)}
          </section>
        </div>
      )}
    </RealtimeProvider>
  );
}

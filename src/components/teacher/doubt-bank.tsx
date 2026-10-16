"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card, Empty, PageHeader } from "@/components/ui/card";
import { StatusPill } from "@/components/help/status-pill";
import { teacherDoubtBank } from "@/lib/rpc/rpc";
import { keys } from "@/lib/queries";
import { dateTime } from "@/lib/format";

export function DoubtBank() {
  const q = useQuery({ queryKey: keys.doubtBank(), queryFn: teacherDoubtBank, refetchInterval: 30_000 });
  return (
    <div className="space-y-4">
      <PageHeader title="Doubt Bank" />
      <p className="text-sm text-text-2">Questions students asked after class.</p>
      {q.isLoading ? <p role="status">Loading…</p> : !q.data?.length ? <Empty>No after-class questions.</Empty> : (
        <ul className="space-y-2">
          {q.data.map((r) => (
            <li key={r.request_id}><Link href={`/teacher/sessions/${r.session_id}/requests/${r.request_id}`}>
              <Card className="space-y-1 hover:bg-surface-2">
                <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><StatusPill status={r.status} /><span className="text-sm font-medium">{r.display_name}</span></span><span className="text-xs text-text-3">{dateTime(r.created_at)}</span></div>
                <p className="line-clamp-2 text-sm">{r.message}</p>
                <p className="text-xs text-text-3">{r.course_title} · {r.session_title}{r.has_code ? " · has code" : ""}</p>
              </Card>
            </Link></li>
          ))}
        </ul>
      )}
    </div>
  );
}

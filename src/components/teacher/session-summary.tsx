"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card, Empty, PageHeader } from "@/components/ui/card";
import { fetchSession, fetchTopics, keys } from "@/lib/queries";
import { teacherRequests } from "@/lib/rpc/rpc";
import { createClient } from "@/lib/supabase/client";
import { clock, pct } from "@/lib/format";

interface HistRow { at: string; understand: number; partial: number; lost: number; topic_id: string | null }
interface Ticket { muddiest: string | null; confidence: number | null }

export function SessionSummary({ sessionId }: { sessionId: string }) {
  const session = useQuery({ queryKey: keys.session(sessionId), queryFn: () => fetchSession(sessionId) });
  const topics = useQuery({ queryKey: keys.topics(sessionId), queryFn: () => fetchTopics(sessionId) });
  const reqs = useQuery({ queryKey: keys.tRequests(sessionId), queryFn: () => teacherRequests(sessionId) });
  const hist = useQuery({
    queryKey: keys.pulseHistory(sessionId),
    queryFn: async () => {
      const { data, error } = await createClient().from("pulse_history").select("at,understand,partial,lost,topic_id").eq("session_id", sessionId).order("at");
      if (error) throw new Error(error.message);
      return (data ?? []) as HistRow[];
    },
  });
  const tickets = useQuery({
    queryKey: ["exitTicketsT", sessionId],
    queryFn: async () => {
      const { data, error } = await createClient().from("exit_tickets").select("muddiest,confidence").eq("session_id", sessionId);
      if (error) throw new Error(error.message);
      return (data ?? []) as Ticket[];
    },
  });

  if (session.isLoading) return <p role="status">Loading…</p>;
  const h = hist.data ?? [];
  const byTopic = (topics.data ?? []).map((t) => {
    const rows = h.filter((x) => x.topic_id === t.id);
    const tot = rows.reduce((a, x) => a + x.understand + x.partial + x.lost, 0);
    const lost = rows.reduce((a, x) => a + x.lost, 0);
    const qs = (reqs.data ?? []).filter((r) => r.topic_id === t.id).length;
    return { t, lostPct: pct(lost, tot), tot, qs };
  }).sort((a, b) => b.lostPct - a.lostPct);

  const unresolved = (reqs.data ?? []).filter((r) => r.status !== "handled" || r.student_confirmed === "not_cleared" || r.student_confirmed === "partly");
  const muddy = (tickets.data ?? []).filter((x) => x.muddiest?.trim());
  const lowConf = (tickets.data ?? []).filter((x) => x.confidence === 1).length;

  // T6: plain, rule-based suggestions (no AI).
  const suggestions: string[] = [];
  const worst = byTopic.find((b) => b.tot >= 5 && b.lostPct >= 30);
  if (worst) suggestions.push(`Revisit “${worst.t.label}”: ${worst.lostPct}% of responses said lost.`);
  if (unresolved.length) suggestions.push(`${unresolved.length} question${unresolved.length === 1 ? " is" : "s are"} unresolved or not fully cleared.`);
  if (lowConf >= 3) suggestions.push(`${lowConf} students left class with low confidence.`);
  if (!suggestions.length) suggestions.push("Nothing stands out. Consider a quick recap quiz next time.");

  const max = Math.max(1, ...h.map((x) => x.understand + x.partial + x.lost));
  return (
    <div className="space-y-5">
      <Link href="/teacher" className="text-sm underline">← Courses</Link>
      <PageHeader title={`Summary · ${session.data?.title ?? ""}`} />
      <Card className="space-y-2">
        <h2 className="font-medium">Next-class suggestions</h2>
        <ul className="list-disc pl-5 text-sm">{suggestions.map((x) => <li key={x}>{x}</li>)}</ul>
      </Card>
      <Card className="space-y-2">
        <h2 className="font-medium">Pulse over time</h2>
        {!h.length ? <Empty>No pulse data recorded.</Empty> : (
          <div role="img" aria-label="Pulse over time: stacked bars of following, partly and lost" className="flex h-32 items-end gap-px">
            {h.map((x) => {
              const tot = x.understand + x.partial + x.lost;
              return (
                <div key={x.at} title={`${clock(x.at)}: ${x.understand} following, ${x.partial} partly, ${x.lost} lost`} className="flex min-w-[3px] flex-1 flex-col justify-end" style={{ height: `${(tot / max) * 100}%` }}>
                  <div className="bg-danger" style={{ flex: x.lost }} /><div className="bg-warn" style={{ flex: x.partial }} /><div className="bg-ok" style={{ flex: x.understand }} />
                </div>
              );
            })}
          </div>
        )}
      </Card>
      <Card className="space-y-2">
        <h2 className="font-medium">Topics by confusion</h2>
        {!byTopic.length ? <p className="text-sm text-text-3">No topic markers were set.</p> : (
          <table className="w-full text-sm"><thead><tr className="text-left text-text-3"><th>Topic</th><th>Lost</th><th>Questions</th></tr></thead>
            <tbody>{byTopic.map((b) => <tr key={b.t.id}><td>{b.t.label}</td><td>{b.tot ? `${b.lostPct}%` : "–"}</td><td>{b.qs}</td></tr>)}</tbody></table>
        )}
      </Card>
      <Card className="space-y-2">
        <h2 className="font-medium">Muddiest points (exit tickets, anonymous)</h2>
        {!muddy.length ? <p className="text-sm text-text-3">None submitted.</p> : <ul className="list-disc space-y-1 pl-5 text-sm">{muddy.map((x, i) => <li key={i} className="whitespace-pre-wrap">{x.muddiest}</li>)}</ul>}
      </Card>
    </div>
  );
}

"use client";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert, Card, Empty, PageHeader } from "@/components/ui/card";
import { adminBreakGlass, codeOf } from "@/lib/rpc/rpc";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/content/copy";
import { dateTime } from "@/lib/format";

interface Row { id: number | string; action: string; created_at: string; actor_id: string | null; target_type: string | null }

export function AuditView() {
  const q = useQuery({
    queryKey: ["audit"],
    queryFn: async () => {
      const { data, error } = await createClient().from("audit_log").select("id,action,created_at,actor_id,target_type").order("created_at", { ascending: false }).limit(200);
      if (error) throw new Error(error.message);
      return (data ?? []) as Row[];
    },
  });
  const [rid, setRid] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const bg = useMutation({
    mutationFn: () => adminBreakGlass(rid.trim(), reason.trim()),
    onSuccess: (r) => { setMsg({ tone: "ok", text: `Identity: ${r.full_name}${r.ug_number ? ` (${r.ug_number})` : ""}. This access was logged.` }); setReason(""); void q.refetch(); },
    onError: (e) => setMsg({ tone: "danger", text: errorMessage(codeOf(e)) }),
  });
  return (
    <div className="space-y-5">
      <PageHeader title="Audit log" />
      <Card className="space-y-3">
        <h2 className="font-medium">Break-glass identity reveal</h2>
        <p className="text-sm text-text-2">For strict-anonymity questions only, e.g. a safety concern. A written reason is required and the access is logged.</p>
        <form onSubmit={(e) => { e.preventDefault(); setMsg(null); bg.mutate(); }} className="space-y-2">
          <Field label="Request ID" htmlFor="bg-r"><Input id="bg-r" className="font-mono" value={rid} onChange={(e) => setRid(e.target.value)} /></Field>
          <Field label="Reason (min 20 characters)" htmlFor="bg-w"><Input id="bg-w" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
          <Button type="submit" variant="danger" disabled={!rid.trim() || reason.trim().length < 20 || bg.isPending}>Reveal and log</Button>
        </form>
      </Card>
      {!q.data?.length ? <Empty>No audit entries.</Empty> : (
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-left text-text-3"><th className="p-2">When</th><th>Action</th><th>Target</th></tr></thead>
          <tbody>{q.data.map((r) => <tr key={r.id} className="border-t border-border"><td className="p-2 text-xs">{dateTime(r.created_at)}</td><td className="font-mono text-xs">{r.action}</td><td className="text-xs">{r.target_type ?? "—"}</td></tr>)}</tbody>
        </table></div>
      )}
    </div>
  );
}

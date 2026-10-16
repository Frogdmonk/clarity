"use client";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Alert, Empty, PageHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { adminPurgeUser, adminSetRole, adminSetVerification, codeOf } from "@/lib/rpc/rpc";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/content/copy";
import { dateTime } from "@/lib/format";
import type { AppRole, Verification } from "@/lib/types";

interface U { id: string; full_name: string; ug_number: string | null; verification: Verification; created_at: string; role: AppRole }

async function fetchUsers(): Promise<U[]> {
  const sb = createClient();
  const [p, r] = await Promise.all([
    sb.from("profiles").select("id,full_name,ug_number,verification,created_at").order("created_at", { ascending: false }).limit(1000),
    sb.from("user_roles").select("user_id,role"),
  ]);
  if (p.error) throw new Error(p.error.message);
  const roles = new Map(((r.data ?? []) as { user_id: string; role: AppRole }[]).map((x) => [x.user_id, x.role]));
  return ((p.data ?? []) as Omit<U, "role">[]).map((u) => ({ ...u, role: roles.get(u.id) ?? "student" }));
}

export function UsersTable({ selfId, pendingOnly = false }: { selfId: string; pendingOnly?: boolean }) {
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ["adminUsers"], queryFn: fetchUsers });
  const [search, setSearch] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [purge, setPurge] = useState<U | null>(null);
  const done = () => qc.invalidateQueries({ queryKey: ["adminUsers"] });
  const onError = (e: unknown) => setErr(errorMessage(codeOf(e)));
  const setRole = useMutation({ mutationFn: ({ id, role }: { id: string; role: AppRole }) => adminSetRole(id, role), onSuccess: done, onError });
  const setVer = useMutation({ mutationFn: ({ id, v }: { id: string; v: Verification }) => adminSetVerification(id, v), onSuccess: done, onError });
  const doPurge = useMutation({ mutationFn: (id: string) => adminPurgeUser(id), onSuccess: async () => { setPurge(null); await done(); }, onError: (e) => { setPurge(null); onError(e); } });

  const rows = useMemo(() => {
    const t = search.trim().toLowerCase();
    return (users.data ?? []).filter((u) => (!pendingOnly || u.verification === "pending") && (!t || `${u.full_name} ${u.ug_number ?? ""}`.toLowerCase().includes(t)));
  }, [users.data, search, pendingOnly]);

  return (
    <div className="space-y-4">
      <PageHeader title={pendingOnly ? "Waiting for approval" : "Users"} />
      {err && <Alert tone="danger">{err}</Alert>}
      {!pendingOnly && <Input aria-label="Search users" type="search" placeholder="Search name or UG number" value={search} onChange={(e) => setSearch(e.target.value)} />}
      {users.isLoading ? <p role="status">Loading…</p> : !rows.length ? <Empty>{pendingOnly ? "No one is waiting." : "No users found."}</Empty> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-text-3"><th className="p-2">Name</th><th>UG</th><th>Status</th><th>Role</th><th>Joined</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="p-2">{u.full_name}</td><td className="font-mono text-xs">{u.ug_number ?? "—"}</td>
                  <td className="capitalize">{u.verification}</td>
                  <td>
                    <Select aria-label={`Role for ${u.full_name}`} value={u.role} disabled={u.id === selfId || setRole.isPending} onChange={(e) => { setErr(null); setRole.mutate({ id: u.id, role: e.target.value as AppRole }); }}>
                      <option value="student">student</option><option value="teacher">teacher</option><option value="admin">admin</option>
                    </Select>
                  </td>
                  <td className="text-xs text-text-3">{dateTime(u.created_at)}</td>
                  <td className="space-x-1 whitespace-nowrap p-2">
                    {u.verification !== "verified" && <Button variant="secondary" disabled={setVer.isPending} onClick={() => { setErr(null); setVer.mutate({ id: u.id, v: "verified" }); }}>Approve</Button>}
                    {u.verification === "pending" && <Button variant="ghost" disabled={setVer.isPending} onClick={() => { setErr(null); setVer.mutate({ id: u.id, v: "rejected" }); }}>Reject</Button>}
                    {u.verification === "verified" && u.id !== selfId && <Button variant="ghost" disabled={setVer.isPending} onClick={() => { setErr(null); setVer.mutate({ id: u.id, v: "disabled" }); }}>Disable</Button>}
                    {u.id !== selfId && <Button variant="ghost" onClick={() => setPurge(u)}>Delete…</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={!!purge} onClose={() => setPurge(null)} title="Permanently delete this user?">
        <p className="text-sm text-text-2">{purge?.full_name}&apos;s account and data will be erased. This can&apos;t be undone.</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setPurge(null)}>Cancel</Button>
          <Button variant="danger" disabled={doPurge.isPending} onClick={() => purge && doPurge.mutate(purge.id)}>Delete permanently</Button>
        </div>
      </Dialog>
    </div>
  );
}

"use client";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Alert, Card, Empty, PageHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/field";
import { fetchNotebook, keys } from "@/lib/queries";
import { cacheNotebook, getCachedNotebook } from "@/lib/drafts/outbox";
import { createClient } from "@/lib/supabase/client";
import { copy, errorMessage } from "@/content/copy";
import { dateTime } from "@/lib/format";
import type { NotebookEntry } from "@/lib/types";

export function NotebookView({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [revision, setRevision] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [toDelete, setToDelete] = useState<NotebookEntry | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cached, setCached] = useState<NotebookEntry[] | undefined>();

  const q = useQuery({ queryKey: keys.notebook(), queryFn: fetchNotebook });

  useEffect(() => { void getCachedNotebook<NotebookEntry>(userId).then(setCached).catch(() => undefined); }, [userId]);
  useEffect(() => { if (q.data) void cacheNotebook(userId, q.data).catch(() => undefined); }, [q.data, userId]);

  const entries = useMemo(() => q.data ?? cached ?? [], [q.data, cached]);
  const offlineCopy = !q.data && !!cached;
  const shown = useMemo(() => {
    const t = search.trim().toLowerCase();
    return t ? entries.filter((e) => `${e.title} ${e.body} ${e.snapshot_code ?? ""}`.toLowerCase().includes(t)) : entries;
  }, [entries, search]);

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await createClient().from("notebook_entries").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => { setToDelete(null); await qc.invalidateQueries({ queryKey: keys.notebook() }); },
    onError: () => setErr(errorMessage("generic")),
  });

  return (
    <div className="space-y-4">
      <PageHeader title="My notebook">
        <Button variant="secondary" aria-pressed={revision} onClick={() => { setRevision((r) => !r); setRevealed(new Set()); }}>
          {revision ? "Exit revision mode" : "Revision mode"}
        </Button>
      </PageHeader>
      {offlineCopy && <Alert tone="warn">You&apos;re seeing a saved copy. Changes need a connection.</Alert>}
      {err && <Alert tone="danger">{err}</Alert>}
      <label htmlFor="nb-search" className="sr-only">Search notebook</label>
      <Input id="nb-search" type="search" placeholder="Search your notes and code" value={search} onChange={(e) => setSearch(e.target.value)} />
      {!shown.length ? <Empty>{entries.length ? "No matches." : copy.empty.notebook}</Empty> : (
        <ul className="space-y-3">
          {shown.map((e) => {
            const hidden = revision && !revealed.has(e.id);
            return (
              <li key={e.id}><Card className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-medium">{e.title}</h2>
                  <span className="shrink-0 text-xs text-text-3">{dateTime(e.created_at)}</span>
                </div>
                {hidden ? (
                  <Button variant="secondary" onClick={() => setRevealed((s) => new Set(s).add(e.id))}>Try to recall, then show</Button>
                ) : (
                  <>
                    {e.body && <p className="whitespace-pre-wrap text-sm">{e.body}</p>}
                    {e.snapshot_code && <pre className="overflow-x-auto rounded-md bg-surface-2 p-2 font-mono text-xs" tabIndex={0}><code>{e.snapshot_code}</code></pre>}
                  </>
                )}
                <Button variant="ghost" onClick={() => setToDelete(e)}>Delete</Button>
              </Card></li>
            );
          })}
        </ul>
      )}
      <Dialog open={!!toDelete} onClose={() => setToDelete(null)} title="Delete this note?">
        <p className="text-sm text-text-2">This can&apos;t be undone.</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setToDelete(null)}>Keep it</Button>
          <Button disabled={del.isPending} onClick={() => toDelete && del.mutate(toDelete.id)}>{del.isPending ? "Deleting…" : "Delete"}</Button>
        </div>
      </Dialog>
    </div>
  );
}

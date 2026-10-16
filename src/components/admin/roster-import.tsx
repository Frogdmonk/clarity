"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Alert, Card, PageHeader } from "@/components/ui/card";
import { adminImportRoster, codeOf } from "@/lib/rpc/rpc";
import { rosterRows } from "@/lib/csv";
import { errorMessage } from "@/content/copy";

const CHUNK = 1000;

export function RosterImport() {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "danger" | "warn"; text: string } | null>(null);
  const rows = rosterRows(text);

  const imp = useMutation({
    mutationFn: async () => {
      let imported = 0, invalid = 0, verified = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const r = await adminImportRoster(rows.slice(i, i + CHUNK));
        imported += r.imported; invalid += r.invalid; verified += r.verified_now;
      }
      return { imported, invalid, verified };
    },
    onSuccess: (r) => setMsg({ tone: r.invalid ? "warn" : "ok", text: `Imported ${r.imported}. Invalid rows skipped: ${r.invalid}. Accounts verified now: ${r.verified}.` }),
    onError: (e) => setMsg({ tone: "danger", text: errorMessage(codeOf(e)) }),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="Roster import" />
      <Card className="space-y-3">
        <p className="text-sm text-text-2">Paste CSV with two columns: UG number, full name. Max 5000 rows per import.</p>
        <input type="file" accept=".csv,text/csv,text/plain" aria-label="Choose a CSV file"
          onChange={async (e) => { const f = e.target.files?.[0]; if (f && f.size < 2_000_000) setText(await f.text()); }} />
        <label htmlFor="csv" className="sr-only">CSV contents</label>
        <Textarea id="csv" rows={10} className="font-mono" value={text} onChange={(e) => setText(e.target.value)} />
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <Button disabled={!rows.length || rows.length > 5000 || imp.isPending} onClick={() => { setMsg(null); imp.mutate(); }}>
          {imp.isPending ? "Importing…" : `Import ${rows.length} row${rows.length === 1 ? "" : "s"}`}
        </Button>
      </Card>
    </div>
  );
}

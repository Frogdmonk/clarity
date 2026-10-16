"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/card";
import { QrScanner } from "./qr-scanner";
import { codeOf, joinByCode } from "@/lib/rpc/rpc";
import { errorMessage } from "@/content/copy";

export function JoinForm({ initialCode = "", scanner = false }: { initialCode?: string; scanner?: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState(false);

  const join = useMutation({
    mutationFn: (c: string) => joinByCode(c),
    onSuccess: (r) => {
      if (r.ok) router.push(`/student/sessions/${r.session_id}`);
      else setError(errorMessage(r.error));
    },
    onError: (e) => setError(errorMessage(codeOf(e))),
  });

  return (
    <div className="space-y-3">
      <form onSubmit={(e) => { e.preventDefault(); setError(null); join.mutate(code); }} className="space-y-3">
        <Field label="Class code" htmlFor="code" hint="6 characters, shown on the projector.">
          <Input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
            autoComplete="off" autoCapitalize="characters" inputMode="text" className="text-center font-mono text-2xl tracking-widest" />
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="submit" block disabled={code.length < 6 || join.isPending}>{join.isPending ? "Joining…" : "Join"}</Button>
      </form>
      {scanner && (
        <>
          <Button variant="secondary" block onClick={() => setScan((s) => !s)}>{scan ? "Hide camera" : "Scan the QR code"}</Button>
          {scan && <QrScanner onCode={(c) => { setScan(false); setCode(c); setError(null); join.mutate(c); }} />}
        </>
      )}
    </div>
  );
}

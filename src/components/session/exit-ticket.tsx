"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Alert } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";
import { codeOf, submitExitTicket } from "@/lib/rpc/rpc";
import { errorMessage } from "@/content/copy";
import { keys } from "@/lib/queries";
import { cn } from "@/lib/cn";

const levels = [{ v: 1, label: "Shaky" }, { v: 2, label: "OK" }, { v: 3, label: "Confident" }];

/** B13: optional 60-second "muddiest point". */
export function ExitTicket({ sessionId }: { sessionId: string }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [level, setLevel] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const done = useQuery({
    queryKey: keys.exitTicket(sessionId),
    queryFn: async () => {
      const { data } = await createClient().from("exit_tickets").select("session_id").eq("session_id", sessionId).maybeSingle();
      return !!data;
    },
  });
  const send = useMutation({
    mutationFn: () => submitExitTicket(sessionId, text, level),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.exitTicket(sessionId) }),
    onError: (e) => setError(errorMessage(codeOf(e))),
  });
  if (done.isLoading) return null;
  if (done.data) return <Alert tone="ok">Thanks. Your muddiest point will shape the next class.</Alert>;
  return (
    <Card className="space-y-3">
      <h3 className="font-medium">What was the muddiest point today?</h3>
      <p className="text-sm text-text-2">Optional, takes a minute. Your teacher uses this to plan the next class.</p>
      <Textarea aria-label="Muddiest point" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} />
      <div className="flex gap-2" role="group" aria-label="How confident do you feel now?">
        {levels.map((l) => (
          <button key={l.v} type="button" aria-pressed={level === l.v} onClick={() => setLevel(l.v)}
            className={cn("min-h-[44px] flex-1 rounded-md border px-2 text-sm",
              level === l.v ? "border-accent bg-accent text-accent-contrast" : "border-border")}>
            {l.label}
          </button>
        ))}
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <Button onClick={() => send.mutate()} disabled={send.isPending}>Send</Button>
    </Card>
  );
}

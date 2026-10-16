"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Alert } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { copy, errorMessage } from "@/content/copy";
import { codeOf, pollResults, respondPoll } from "@/lib/rpc/rpc";
import { keys } from "@/lib/queries";
import type { Poll } from "@/lib/types";
import { cn } from "@/lib/cn";

const conf = [{ v: 1, label: "Guessing" }, { v: 2, label: "Fairly sure" }, { v: 3, label: "Certain" }];

/** B12: predict -> how sure are you? -> reveal. Calibration feedback stays private to the student. */
export function PollCard({ poll, sessionId }: { poll: Poll; sessionId: string }) {
  const qc = useQueryClient();
  const [choice, setChoice] = useState<string>("");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const options = poll.kind === "true_false" ? ["True", "False"] : poll.options;
  const mine = poll.my_response;

  const send = useMutation({
    mutationFn: () => respondPoll(poll.id, choice, confidence),
    onSuccess: () => { setError(null); void qc.invalidateQueries({ queryKey: keys.polls(sessionId) }); },
    onError: (e) => setError(errorMessage(codeOf(e))),
  });
  const results = useQuery({
    queryKey: ["pollResults", poll.id], queryFn: () => pollResults(poll.id), enabled: poll.status === "revealed",
  });

  const correct = poll.correct as string | null;
  const wasRight = mine && correct != null ? String(mine.response) === String(correct) : null;

  return (
    <Card className="space-y-3">
      <h3 className="font-medium">{poll.question}</h3>
      {poll.status === "open" && !mine || (poll.status === "open" && poll.allow_change) ? (
        <form onSubmit={(e) => { e.preventDefault(); send.mutate(); }} className="space-y-3">
          <div role="radiogroup" aria-label="Answer" className="grid gap-2">
            {options.map((o) => (
              <label key={o} className={cn("flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md border px-3",
                choice === o ? "border-accent bg-surface-2" : "border-border")}>
                <input type="radio" name={`poll-${poll.id}`} value={o} checked={choice === o} onChange={() => setChoice(o)} className="size-5" />
                <span className="font-mono text-sm">{o}</span>
              </label>
            ))}
          </div>
          {poll.require_confidence && (
            <fieldset>
              <legend className="mb-1 text-sm">How sure are you?</legend>
              <div className="flex gap-2">
                {conf.map((c) => (
                  <button key={c.v} type="button" aria-pressed={confidence === c.v} onClick={() => setConfidence(c.v)}
                    className={cn("min-h-[44px] flex-1 rounded-md border px-2 text-sm",
                      confidence === c.v ? "border-accent bg-accent text-accent-contrast" : "border-border")}>
                    {c.label}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" disabled={!choice || send.isPending}>{mine ? "Change answer" : "Send answer"}</Button>
        </form>
      ) : mine ? (
        <p className="text-sm text-text-2" role="status">Answer sent: <span className="font-mono">{String(mine.response)}</span></p>
      ) : (
        <p className="text-sm text-text-2">{poll.status === "closed" ? copy.errors.poll_closed : "No answer sent."}</p>
      )}
      {poll.status === "revealed" && correct != null && (
        <div className="space-y-1 text-sm" aria-live="polite">
          <p>Correct answer: <span className="font-mono font-medium">{String(correct)}</span></p>
          {wasRight != null && (
            <p>
              {wasRight ? "You got it." : "Not this time — and that's useful to know."}
              {mine?.confidence ? ` You were ${conf.find((c) => c.v === mine.confidence)?.label.toLowerCase()}.` : ""}
            </p>
          )}
          {results.data && <p className="text-text-2">{results.data.total} classmates answered.</p>}
        </div>
      )}
    </Card>
  );
}

"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert, Card } from "@/components/ui/card";
import { closePoll, codeOf, createPoll, getSessionPolls, openPoll, pollResults, revealPoll } from "@/lib/rpc/rpc";
import { keys } from "@/lib/queries";
import { errorMessage } from "@/content/copy";
import type { Poll } from "@/lib/types";

function Results({ poll }: { poll: Poll }) {
  const q = useQuery({ queryKey: ["pollResults", poll.id, poll.status], queryFn: () => pollResults(poll.id), refetchInterval: poll.status === "open" ? 4_000 : false });
  if (!q.data) return null;
  const options = poll.kind === "true_false" ? ["True", "False"] : poll.options;
  return (
    <div className="space-y-1" aria-label="Poll results">
      <p className="text-xs text-text-3">{q.data.total} response{q.data.total === 1 ? "" : "s"}</p>
      {options.map((o) => {
        const n = q.data.counts[o] ?? 0;
        const w = q.data.total ? Math.round((n / q.data.total) * 100) : 0;
        return (
          <div key={o} className="flex items-center gap-2 text-sm">
            <span className="w-28 truncate font-mono">{o}{poll.correct === o ? " ✓" : ""}</span>
            <div className="h-3 flex-1 overflow-hidden rounded bg-surface-2" aria-hidden><div className="h-full bg-accent" style={{ width: `${w}%` }} /></div>
            <span className="w-8 text-right">{n}</span>
          </div>
        );
      })}
    </div>
  );
}

export function PollManager({ sessionId, live }: { sessionId: string; live: boolean }) {
  const qc = useQueryClient();
  const polls = useQuery({ queryKey: keys.polls(sessionId), queryFn: () => getSessionPolls(sessionId), refetchInterval: 8_000 });
  const [question, setQuestion] = useState("");
  const [kind, setKind] = useState("mcq");
  const [optText, setOptText] = useState("");
  const [correct, setCorrect] = useState("");
  const [conf, setConf] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: keys.polls(sessionId) });

  const create = useMutation({
    mutationFn: () => {
      const options = kind === "mcq" ? optText.split("\n").map((s) => s.trim()).filter(Boolean) : [];
      if (kind === "mcq" && options.length < 2) throw new Error("options");
      return createPoll({ sessionId, question: question.trim(), kind, options, correct: correct.trim() || null, allowChange: false, requireConfidence: conf });
    },
    onSuccess: async () => { setQuestion(""); setOptText(""); setCorrect(""); await refresh(); },
    onError: (e) => setErr(e instanceof Error && e.message === "options" ? "Give at least two options, one per line." : errorMessage(codeOf(e))),
  });
  const act = useMutation({
    mutationFn: ({ fn, id }: { fn: (id: string) => Promise<void>; id: string }) => fn(id),
    onSuccess: refresh,
    onError: (e) => setErr(errorMessage(codeOf(e))),
  });

  return (
    <div className="space-y-3">
      <h2 className="font-medium">Quick polls</h2>
      {err && <Alert tone="danger">{err}</Alert>}
      {polls.data?.map((p) => (
        <Card key={p.id} className="space-y-2">
          <div className="flex items-start justify-between gap-2"><p className="text-sm font-medium">{p.question}</p><span className="text-xs capitalize text-text-3">{p.status}</span></div>
          {p.status !== "draft" && <Results poll={p} />}
          <div className="flex flex-wrap gap-2">
            {p.status === "draft" && <Button disabled={!live || act.isPending} onClick={() => act.mutate({ fn: openPoll, id: p.id })}>Open</Button>}
            {p.status === "open" && <Button disabled={act.isPending} onClick={() => act.mutate({ fn: closePoll, id: p.id })}>Close</Button>}
            {p.status === "closed" && <Button disabled={act.isPending} onClick={() => act.mutate({ fn: revealPoll, id: p.id })}>Reveal answer</Button>}
          </div>
        </Card>
      ))}
      <form onSubmit={(e) => { e.preventDefault(); setErr(null); create.mutate(); }} className="space-y-2 rounded-lg border border-border p-3">
        <Field label="New poll question" htmlFor="pq"><Input id="pq" value={question} maxLength={300} onChange={(e) => setQuestion(e.target.value)} /></Field>
        <Field label="Type" htmlFor="pk">
          <Select id="pk" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="mcq">Multiple choice</option><option value="true_false">True / false</option>
          </Select>
        </Field>
        {kind === "mcq" && <Field label="Options (one per line)" htmlFor="po"><Textarea id="po" rows={3} value={optText} onChange={(e) => setOptText(e.target.value)} /></Field>}
        <Field label="Correct answer (optional, hidden until you reveal)" htmlFor="pc"><Input id="pc" value={correct} onChange={(e) => setCorrect(e.target.value)} /></Field>
        <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={conf} onChange={(e) => setConf(e.target.checked)} /> Ask how sure they are</label>
        <Button type="submit" disabled={!question.trim() || create.isPending}>{create.isPending ? "Adding…" : "Add poll"}</Button>
      </form>
    </div>
  );
}
